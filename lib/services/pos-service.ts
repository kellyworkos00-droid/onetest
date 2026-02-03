/**
 * Kelly OS — POS (Point of Sale) Service
 * 
 * PURPOSE:
 * Manage POS sales that remain pending until payment confirmation
 * 
 * FLOW:
 * 1. Create POS sale (status: PENDING)
 * 2. Customer pays via M-Pesa (uses POS ID as account reference)
 * 3. Payment processor creates invoice and links to POS sale
 * 4. POS sale status → PAID
 * 5. Inventory updated (if applicable)
 */

import prisma from '@/lib/prisma';
import { POSStatus, Prisma } from '@prisma/client';
import { InvoiceService } from './invoice-service';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatePOSSaleParams {
  customerId?: string; // Optional for walk-in customers
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  cashierId?: string;
  branchId?: string;
}

export interface POSSaleResult {
  id: string;
  posId: string;
  amount: number;
  status: POSStatus;
  customerId?: string;
}

// ============================================================================
// POS SERVICE
// ============================================================================

export class POSService {
  /**
   * Create a new POS sale (remains PENDING until payment)
   */
  static async createSale(params: CreatePOSSaleParams): Promise<POSSaleResult> {
    const { customerId, items, cashierId, branchId } = params;

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    // Generate POS ID
    const posId = await this.generatePOSId();

    // Create POS sale
    const sale = await prisma.pOSSale.create({
      data: {
        posId,
        customerId,
        amount: new Prisma.Decimal(totalAmount),
        status: POSStatus.PENDING,
        cashierId,
        branchId,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.quantity * item.unitPrice),
          })),
        },
      },
      include: {
        items: true,
      },
    });

    console.log('🛒 POS sale created:', {
      posId,
      amount: totalAmount,
      items: items.length,
    });

    return {
      id: sale.id,
      posId: sale.posId,
      amount: sale.amount.toNumber(),
      status: sale.status,
      customerId: sale.customerId || undefined,
    };
  }

  /**
   * Convert POS sale to invoice when payment is received
   * (Called by payment processor)
   */
  static async convertToInvoice(params: {
    posId: string;
    customerId: string;
  }): Promise<string> {
    const { posId, customerId } = params;

    const sale = await prisma.pOSSale.findUnique({
      where: { posId },
      include: { items: true },
    });

    if (!sale) {
      throw new Error(`POS sale not found: ${posId}`);
    }

    if (sale.invoiceId) {
      throw new Error(`POS sale already has invoice: ${posId}`);
    }

    // Create invoice from POS sale
    const invoice = await InvoiceService.createInvoice({
      customerId,
      amount: sale.amount.toNumber(),
      description: `POS Sale ${posId}`,
      lineItems: sale.items.map((item: any) => ({
        description: item.productName,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        productId: item.productId,
      })),
      posId: sale.id,
    });

    // Update POS sale
    await prisma.pOSSale.update({
      where: { id: sale.id },
      data: {
        invoiceId: invoice.id,
        status: POSStatus.PAID,
        customerId, // Update if it was a walk-in customer
      },
    });

    console.log('📄 POS sale converted to invoice:', {
      posId,
      invoiceId: invoice.invoiceId,
    });

    return invoice.id;
  }

  /**
   * Generate unique POS ID
   * Format: POS-YYYYMMDD-XXXX
   */
  static async generatePOSId(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get today's POS count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await prisma.pOSSale.count({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    return `POS-${dateStr}-${sequence}`;
  }

  /**
   * Get POS sale by ID
   */
  static async getSale(posId: string) {
    return prisma.pOSSale.findFirst({
      where: {
        OR: [
          { id: posId },
          { posId },
        ],
      },
      include: {
        items: true,
      },
    });
  }

  /**
   * Get pending POS sales (awaiting payment)
   */
  static async getPendingSales(params?: {
    customerId?: string;
    branchId?: string;
  }) {
    return prisma.pOSSale.findMany({
      where: {
        status: POSStatus.PENDING,
        ...(params?.customerId && { customerId: params.customerId }),
        ...(params?.branchId && { branchId: params.branchId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
      },
    });
  }

  /**
   * Cancel a POS sale (before payment)
   */
  static async cancelSale(posId: string): Promise<void> {
    const sale = await prisma.pOSSale.findUnique({
      where: { posId },
    });

    if (!sale) {
      throw new Error(`POS sale not found: ${posId}`);
    }

    if (sale.status === POSStatus.PAID) {
      throw new Error('Cannot cancel paid POS sale. Create a refund instead.');
    }

    await prisma.pOSSale.update({
      where: { id: sale.id },
      data: { status: POSStatus.CANCELLED },
    });

    console.log('❌ POS sale cancelled:', posId);
  }

  /**
   * Get sales report for a date range
   */
  static async getSalesReport(params: {
    startDate: Date;
    endDate: Date;
    branchId?: string;
    status?: POSStatus;
  }) {
    const { startDate, endDate, branchId, status } = params;

    const sales = await prisma.pOSSale.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(branchId && { branchId }),
        ...(status && { status }),
      },
      include: {
        items: true,
      },
    });

    const totalSales = sales.reduce((sum: number, sale: any) => sum + sale.amount.toNumber(), 0);
    const salesCount = sales.length;

    return {
      sales,
      totalSales,
      salesCount,
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }
}
