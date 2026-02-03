/**
 * Kelly OS — Payment Processor
 * 
 * PURPOSE:
 * Core business logic for processing M-Pesa payments
 * 
 * RESPONSIBILITIES:
 * 1. Identify customer and/or invoice from accountReference
 * 2. Create Payment record
 * 3. Allocate payment to invoices
 * 4. Update customer balance
 * 5. Update invoice statuses
 * 6. Post to accounting ledger
 * 7. Update POS sales
 * 8. Emit real-time events
 * 
 * ATOMICITY:
 * All operations happen in a single database transaction
 * If ANY step fails, the entire payment is rolled back
 */

import prisma from '@/lib/prisma';
import { AccountingEngine, generateTransactionRef } from './accounting-engine';
import { InvoiceStatus, PaymentStatus, PaymentType, POSStatus, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessPaymentParams {
  mpesaReceiptNumber: string;
  transactionId: string;
  accountReference: string; // Customer ID or Invoice ID
  amount: number;
  phone: string;
  transactionDate: Date;
}

export interface PaymentResult {
  id: string;
  customerId: string;
  amount: number;
  invoicesCleared: string[];
  remainingBalance: number;
}

// ============================================================================
// PAYMENT PROCESSOR
// ============================================================================

export async function processPayment(params: ProcessPaymentParams): Promise<PaymentResult> {
  const { mpesaReceiptNumber, transactionId, accountReference, amount, phone, transactionDate } = params;

  console.log('🔄 Processing payment:', {
    mpesaReceiptNumber,
    accountReference,
    amount,
  });

  // Step 1: Idempotency check (extra safety layer)
  const existingPayment = await prisma.payment.findUnique({
    where: { mpesaReceiptNumber },
  });

  if (existingPayment) {
    console.warn('⚠️ Payment already processed:', mpesaReceiptNumber);
    return {
      id: existingPayment.id,
      customerId: existingPayment.customerId,
      amount: existingPayment.amount.toNumber(),
      invoicesCleared: [],
      remainingBalance: 0,
    };
  }

  // Step 2: Identify customer and payment type
  const { customer, invoice, paymentType } = await identifyPaymentTarget(accountReference);

  if (!customer) {
    throw new Error(`Customer not found for account reference: ${accountReference}`);
  }

  // Step 3: Validate business rules
  await validatePayment(customer.id, amount);

  // Step 4: Process payment in atomic transaction
  const result = await prisma.$transaction(async (tx: any) => {
    // 4a: Create payment record
    const payment = await tx.payment.create({
      data: {
        mpesaReceiptNumber,
        transactionId,
        customerId: customer.id,
        amount: new Prisma.Decimal(amount),
        phone,
        accountReference,
        paymentType,
        status: PaymentStatus.PENDING,
        transactionDate,
      },
    });

    // 4b: Allocate payment to invoices
    const allocation = await allocatePayment({
      tx,
      paymentId: payment.id,
      customerId: customer.id,
      amount,
      targetInvoiceId: invoice?.id,
    });

    // 4c: Update customer balance
    const newBalance = customer.balance.toNumber() - amount;
    await tx.customer.update({
      where: { id: customer.id },
      data: { balance: new Prisma.Decimal(newBalance) },
    });

    // 4d: Post to accounting ledger
    const transactionRef = generateTransactionRef('PAY');
    await AccountingEngine.postPaymentReceived({
      transactionRef,
      amount,
      customerId: customer.id,
      paymentId: payment.id,
      invoiceIds: allocation.map((a) => a.invoiceId),
      transactionDate,
      description: `M-Pesa ${mpesaReceiptNumber}`,
    });

    // 4e: Update payment status to COMPLETED
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        postedAt: new Date(),
      },
    });

    // 4f: Update POS sales if applicable
    await updatePOSSales(tx, allocation);

    console.log('✅ Payment processed:', {
      paymentId: payment.id,
      customerId: customer.id,
      amount,
      invoicesCleared: allocation.map((a) => a.invoiceId),
    });

    return {
      id: payment.id,
      customerId: customer.id,
      amount,
      invoicesCleared: allocation.map((a) => a.invoiceId),
      remainingBalance: newBalance,
    };
  });

  // Step 5: Emit real-time event (outside transaction)
  // TODO: Implement WebSocket/Server-Sent Events for dashboard updates
  await emitPaymentEvent(result);

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Identify whether accountReference is a customer ID or invoice ID
 */
async function identifyPaymentTarget(accountReference: string): Promise<{
  customer: any;
  invoice: any | null;
  paymentType: PaymentType;
}> {
  // Try to find invoice first
  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { invoiceId: accountReference },
        { id: accountReference },
      ],
    },
    include: { customer: true },
  });

  if (invoice) {
    return {
      customer: invoice.customer,
      invoice,
      paymentType: PaymentType.INVOICE,
    };
  }

  // Try to find customer
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { customerId: accountReference },
        { id: accountReference },
      ],
    },
  });

  if (customer) {
    return {
      customer,
      invoice: null,
      paymentType: PaymentType.ACCOUNT,
    };
  }

  throw new Error(`Invalid account reference: ${accountReference}`);
}

/**
 * Validate payment against business rules
 */
async function validatePayment(customerId: string, amount: number): Promise<void> {
  // Rule 1: Max transaction amount (KSh 250,000)
  if (amount > 250000) {
    throw new Error(`Payment amount exceeds maximum: KSh ${amount}`);
  }

  // Rule 2: Daily customer limit (KSh 500,000)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaysPayments = await prisma.payment.aggregate({
    where: {
      customerId,
      transactionDate: {
        gte: today,
      },
      status: PaymentStatus.COMPLETED,
    },
    _sum: {
      amount: true,
    },
  });

  const dailyTotal = (todaysPayments._sum.amount?.toNumber() || 0) + amount;
  
  if (dailyTotal > 500000) {
    throw new Error(`Daily limit exceeded: KSh ${dailyTotal} (limit: 500,000)`);
  }
}

/**
 * Allocate payment to invoices
 * 
 * STRATEGY:
 * 1. If targetInvoiceId provided → apply to that invoice
 * 2. Otherwise → apply to oldest unpaid/partially paid invoices (FIFO)
 * 3. If payment exceeds invoices → customer gets credit balance
 */
async function allocatePayment(params: {
  tx: any;
  paymentId: string;
  customerId: string;
  amount: number;
  targetInvoiceId?: string;
}): Promise<Array<{ invoiceId: string; amountApplied: number }>> {
  const { tx, paymentId, customerId, amount, targetInvoiceId } = params;
  
  let remainingAmount = amount;
  const allocations: Array<{ invoiceId: string; amountApplied: number }> = [];

  // Get invoices to pay
  const invoices = await tx.invoice.findMany({
    where: {
      customerId,
      status: {
        in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID],
      },
      ...(targetInvoiceId && { id: targetInvoiceId }),
    },
    orderBy: {
      createdAt: 'asc', // FIFO: Oldest first
    },
  });

  for (const invoice of invoices) {
    if (remainingAmount <= 0) break;

    const invoiceBalance = invoice.balance.toNumber();
    const amountToApply = Math.min(remainingAmount, invoiceBalance);

    // Create payment-invoice link
    await tx.paymentInvoice.create({
      data: {
        paymentId,
        invoiceId: invoice.id,
        amountApplied: new Prisma.Decimal(amountToApply),
      },
    });

    // Update invoice
    const newAmountPaid = invoice.amountPaid.toNumber() + amountToApply;
    const newBalance = invoice.amount.toNumber() - newAmountPaid;
    
    let newStatus = invoice.status;
    if (newBalance <= 0.01) {
      newStatus = InvoiceStatus.PAID;
    } else if (newAmountPaid > 0) {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(newAmountPaid),
        balance: new Prisma.Decimal(newBalance),
        status: newStatus,
      },
    });

    allocations.push({
      invoiceId: invoice.id,
      amountApplied: amountToApply,
    });

    remainingAmount -= amountToApply;

    console.log('💰 Invoice updated:', {
      invoiceId: invoice.invoiceId,
      amountApplied: amountToApply,
      newBalance,
      status: newStatus,
    });
  }

  // If remainingAmount > 0, customer has a credit balance
  // This is handled by the customer.balance field

  return allocations;
}

/**
 * Update POS sales when their linked invoices are paid
 */
async function updatePOSSales(
  tx: any,
  allocations: Array<{ invoiceId: string; amountApplied: number }>
): Promise<void> {
  for (const allocation of allocations) {
    // Find POS sale linked to this invoice
    const invoice = await tx.invoice.findUnique({
      where: { id: allocation.invoiceId },
      include: { customer: true },
    });

    if (invoice?.posId) {
      const posSale = await tx.pOSSale.findUnique({
        where: { posId: invoice.posId },
      });

      if (posSale && posSale.status === POSStatus.PENDING) {
        // Check if invoice is fully paid
        if (invoice.status === InvoiceStatus.PAID) {
          await tx.pOSSale.update({
            where: { id: posSale.id },
            data: {
              status: POSStatus.PAID,
              invoiceId: invoice.id,
            },
          });

          console.log('🛒 POS sale completed:', invoice.posId);
        }
      }
    }
  }
}

/**
 * Emit real-time event for dashboard updates
 * TODO: Implement with WebSocket or Server-Sent Events
 */
async function emitPaymentEvent(result: PaymentResult): Promise<void> {
  // Placeholder for real-time notification system
  // Could use:
  // - Pusher
  // - Ably
  // - Custom WebSocket server
  // - Server-Sent Events (SSE)
  
  console.log('📡 Emitting payment event:', result);
  
  // Example:
  // await pusher.trigger(`customer-${result.customerId}`, 'payment-received', result);
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get customer statement (all transactions)
 */
export async function getCustomerStatement(customerId: string): Promise<any> {
  const [customer, payments, invoices] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
    }),
    prisma.payment.findMany({
      where: { customerId },
      orderBy: { transactionDate: 'desc' },
      include: {
        invoices: {
          include: {
            invoice: true,
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    customer,
    payments,
    invoices,
    currentBalance: customer?.balance.toNumber() || 0,
  };
}

/**
 * Get invoice details with payment history
 */
export async function getInvoiceDetails(invoiceId: string): Promise<any> {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      payments: {
        include: {
          payment: true,
        },
      },
      lineItems: true,
    },
  });
}
