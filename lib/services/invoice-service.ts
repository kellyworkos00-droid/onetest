/**
 * Kelly OS — Invoice Management Service
 * 
 * PURPOSE:
 * Create and manage invoices with accounting integration
 * 
 * FEATURES:
 * - Manual invoice creation
 * - POS-to-invoice conversion
 * - Partial payment support
 * - Automatic accounting entries
 */

import prisma from '@/lib/prisma';
import { AccountingEngine, generateTransactionRef } from './accounting-engine';
import { InvoiceStatus, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateInvoiceParams {
  customerId: string;
  invoiceId?: string; // Optional human-readable ID (auto-generated if not provided)
  amount: number;
  description?: string;
  dueDate?: Date;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    productId?: string;
  }>;
  posId?: string; // Link to POS sale
}

export interface InvoiceResult {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  status: InvoiceStatus;
}

// ============================================================================
// INVOICE SERVICE
// ============================================================================

export class InvoiceService {
  /**
   * Create a new invoice
   * 
   * ACCOUNTING IMPACT:
   * DR  Accounts Receivable  (customer owes money)
   * CR  Sales Revenue        (we earned revenue)
   */
  static async createInvoice(params: CreateInvoiceParams): Promise<InvoiceResult> {
    const { customerId, invoiceId, amount, description, dueDate, lineItems, posId } = params;

    // Validate customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    // Generate invoice ID if not provided
    const finalInvoiceId = invoiceId || await this.generateInvoiceId();

    // Create invoice in transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceId: finalInvoiceId,
          customerId,
          amount: new Prisma.Decimal(amount),
          balance: new Prisma.Decimal(amount),
          amountPaid: new Prisma.Decimal(0),
          status: InvoiceStatus.UNPAID,
          description,
          dueDate,
          posId,
        },
      });

      // 2. Create line items if provided
      if (lineItems && lineItems.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: lineItems.map((item) => ({
            invoiceId: invoice.id,
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.quantity * item.unitPrice),
            productId: item.productId,
          })),
        });
      }

      // 3. Update customer balance
      const newBalance = customer.balance.toNumber() + amount;
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: new Prisma.Decimal(newBalance) },
      });

      // 4. Post to accounting ledger
      const transactionRef = generateTransactionRef('INV');
      await AccountingEngine.postInvoiceCreated({
        transactionRef,
        amount,
        customerId,
        invoiceId: invoice.id,
        transactionDate: new Date(),
        description: description || `Invoice ${finalInvoiceId}`,
      });

      console.log('📄 Invoice created:', {
        invoiceId: finalInvoiceId,
        customerId,
        amount,
      });

      return {
        id: invoice.id,
        invoiceId: invoice.invoiceId,
        customerId: invoice.customerId,
        amount: invoice.amount.toNumber(),
        status: invoice.status,
      };
    });

    return result;
  }

  /**
   * Generate unique invoice ID
   * Format: INV-YYYYMMDD-XXXX
   */
  static async generateInvoiceId(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get today's invoice count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await prisma.invoice.count({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    return `INV-${dateStr}-${sequence}`;
  }

  /**
   * Get invoice by ID
   */
  static async getInvoice(invoiceId: string) {
    return prisma.invoice.findFirst({
      where: {
        OR: [
          { id: invoiceId },
          { invoiceId },
        ],
      },
      include: {
        customer: true,
        lineItems: true,
        payments: {
          include: {
            payment: true,
          },
        },
      },
    });
  }

  /**
   * Get all invoices for a customer
   */
  static async getCustomerInvoices(customerId: string) {
    return prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: true,
        payments: {
          include: {
            payment: true,
          },
        },
      },
    });
  }

  /**
   * Get outstanding (unpaid/partially paid) invoices
   */
  static async getOutstandingInvoices(customerId?: string) {
    return prisma.invoice.findMany({
      where: {
        status: {
          in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID],
        },
        ...(customerId && { customerId }),
      },
      orderBy: { dueDate: 'asc' },
      include: {
        customer: true,
      },
    });
  }

  /**
   * Cancel an invoice (requires reversal entry)
   */
  static async cancelInvoice(invoiceId: string, reason: string): Promise<void> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true },
    });

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Cannot cancel a paid invoice. Create a refund instead.');
    }

    if (invoice.amountPaid.toNumber() > 0) {
      throw new Error('Cannot cancel partially paid invoice. Create an adjustment.');
    }

    await prisma.$transaction(async (tx: any) => {
      // 1. Update invoice status
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
      });

      // 2. Update customer balance
      const newBalance = invoice.customer.balance.toNumber() - invoice.amount.toNumber();
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { balance: new Prisma.Decimal(newBalance) },
      });

      // 3. Reverse accounting entries
      const originalTransactionRef = await this.findInvoiceTransactionRef(invoiceId);
      if (originalTransactionRef) {
        const reversalTransactionRef = generateTransactionRef('REV');
        await AccountingEngine.reverseTransaction({
          originalTransactionRef,
          reversalTransactionRef,
          reversalDate: new Date(),
          reason: `Invoice cancelled: ${reason}`,
        });
      }
    });

    console.log('❌ Invoice cancelled:', invoiceId);
  }

  /**
   * Find the original accounting transaction ref for an invoice
   */
  private static async findInvoiceTransactionRef(invoiceId: string): Promise<string | null> {
    const entry = await prisma.accountingLedger.findFirst({
      where: { invoiceId },
    });
    return entry?.transactionRef || null;
  }
}
