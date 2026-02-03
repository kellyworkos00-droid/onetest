/**
 * Kelly OS — Double-Entry Accounting Engine
 * 
 * PURPOSE:
 * Maintain immutable financial ledger with double-entry bookkeeping
 * 
 * RULES:
 * 1. Every transaction must balance (Debits = Credits)
 * 2. Ledger entries are NEVER updated or deleted (append-only)
 * 3. Corrections are done via reversal entries
 * 4. All entries grouped by transactionRef
 * 
 * CHART OF ACCOUNTS:
 * - 1010: M-Pesa Cash (ASSET)
 * - 1200: Accounts Receivable (ASSET)
 * - 4000: Sales Revenue (REVENUE)
 * - 5000: Cost of Goods Sold (EXPENSE)
 */

import prisma from '@/lib/prisma';
import { AccountType, EntryType, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface LedgerEntry {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  entryType: EntryType;
  amount: number;
  description: string;
}

export interface PostTransactionParams {
  transactionRef: string;
  transactionDate: Date;
  entries: LedgerEntry[];
  tx?: Prisma.TransactionClient;
  paymentId?: string;
  invoiceId?: string;
  customerId?: string;
}

// ============================================================================
// CHART OF ACCOUNTS
// ============================================================================

export const ACCOUNTS = {
  MPESA_CASH: {
    code: '1010',
    name: 'M-Pesa Cash',
    type: AccountType.ASSET,
  },
  ACCOUNTS_RECEIVABLE: {
    code: '1200',
    name: 'Accounts Receivable',
    type: AccountType.ASSET,
  },
  SALES_REVENUE: {
    code: '4000',
    name: 'Sales Revenue',
    type: AccountType.REVENUE,
  },
  COST_OF_GOODS_SOLD: {
    code: '5000',
    name: 'Cost of Goods Sold',
    type: AccountType.EXPENSE,
  },
} as const;

// ============================================================================
// ACCOUNTING ENGINE
// ============================================================================

export class AccountingEngine {
  /**
   * Post a balanced transaction to the ledger
   * 
   * CRITICAL: This function enforces the accounting equation
   * Assets = Liabilities + Equity + (Revenue - Expenses)
   * 
   * @throws Error if debits != credits
   */
  static async postTransaction(params: PostTransactionParams): Promise<void> {
    const { transactionRef, transactionDate, entries, tx, paymentId, invoiceId, customerId } = params;

    // Step 1: Validate transaction balance
    const totalDebits = entries
      .filter((e) => e.entryType === EntryType.DEBIT)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalCredits = entries
      .filter((e) => e.entryType === EntryType.CREDIT)
      .reduce((sum, e) => sum + e.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      // Allow 1 cent rounding difference
      throw new Error(
        `Transaction out of balance: Debits=${totalDebits}, Credits=${totalCredits}`
      );
    }

    // Step 2: Create ledger entries (atomic transaction)
    const client = tx ?? prisma;
    const writes = entries.map((entry) =>
      client.accountingLedger.create({
        data: {
          accountCode: entry.accountCode,
          accountName: entry.accountName,
          accountType: entry.accountType,
          entryType: entry.entryType,
          amount: new Prisma.Decimal(entry.amount),
          transactionRef,
          description: entry.description,
          transactionDate,
          paymentId,
          invoiceId,
          customerId,
        },
      })
    );

    if (tx) {
      await Promise.all(writes);
    } else {
      await prisma.$transaction(writes);
    }

    console.log('📒 Posted to ledger:', {
      transactionRef,
      debits: totalDebits,
      credits: totalCredits,
      entries: entries.length,
    });
  }

  /**
   * Post a payment received from M-Pesa
   * 
   * ACCOUNTING ENTRY:
   * DR  M-Pesa Cash           (increases asset)
   * CR  Accounts Receivable   (decreases asset - customer owes less)
   * 
   * This assumes the invoice already created the A/R:
   * When invoice was created:
   *   DR  Accounts Receivable
   *   CR  Sales Revenue
   */
  static async postPaymentReceived(params: {
    transactionRef: string;
    amount: number;
    customerId: string;
    paymentId: string;
    invoiceIds?: string[];
    transactionDate: Date;
    description: string;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const { transactionRef, amount, customerId, paymentId, invoiceIds, transactionDate, description, tx } = params;

    const entries: LedgerEntry[] = [
      {
        accountCode: ACCOUNTS.MPESA_CASH.code,
        accountName: ACCOUNTS.MPESA_CASH.name,
        accountType: ACCOUNTS.MPESA_CASH.type,
        entryType: EntryType.DEBIT,
        amount,
        description: `M-Pesa payment: ${description}`,
      },
      {
        accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        accountType: ACCOUNTS.ACCOUNTS_RECEIVABLE.type,
        entryType: EntryType.CREDIT,
        amount,
        description: `Payment applied: ${description}`,
      },
    ];

    await this.postTransaction({
      transactionRef,
      transactionDate,
      entries,
      tx,
      paymentId,
      customerId,
      invoiceId: invoiceIds?.[0], // Link to primary invoice if available
    });
  }

  /**
   * Post an invoice creation
   * 
   * ACCOUNTING ENTRY:
   * DR  Accounts Receivable   (customer owes money)
   * CR  Sales Revenue         (we earned revenue)
   */
  static async postInvoiceCreated(params: {
    transactionRef: string;
    amount: number;
    customerId: string;
    invoiceId: string;
    transactionDate: Date;
    description: string;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const { transactionRef, amount, customerId, invoiceId, transactionDate, description, tx } = params;

    const entries: LedgerEntry[] = [
      {
        accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        accountType: ACCOUNTS.ACCOUNTS_RECEIVABLE.type,
        entryType: EntryType.DEBIT,
        amount,
        description: `Invoice raised: ${description}`,
      },
      {
        accountCode: ACCOUNTS.SALES_REVENUE.code,
        accountName: ACCOUNTS.SALES_REVENUE.name,
        accountType: ACCOUNTS.SALES_REVENUE.type,
        entryType: EntryType.CREDIT,
        amount,
        description: `Sales revenue: ${description}`,
      },
    ];

    await this.postTransaction({
      transactionRef,
      transactionDate,
      entries,
      tx,
      invoiceId,
      customerId,
    });
  }

  /**
   * Reverse a transaction (for corrections or refunds)
   * 
   * Creates mirror entries with opposite signs
   */
  static async reverseTransaction(params: {
    originalTransactionRef: string;
    reversalTransactionRef: string;
    reversalDate: Date;
    reason: string;
  }): Promise<void> {
    const { originalTransactionRef, reversalTransactionRef, reversalDate, reason } = params;

    // Step 1: Get original entries
    const originalEntries = await prisma.accountingLedger.findMany({
      where: { transactionRef: originalTransactionRef },
    });

    if (originalEntries.length === 0) {
      throw new Error(`Transaction not found: ${originalTransactionRef}`);
    }

    // Step 2: Create reversal entries (flip DEBIT ↔ CREDIT)
    const reversalEntries: LedgerEntry[] = originalEntries.map((entry: any) => ({
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      accountType: entry.accountType,
      entryType: entry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
      amount: entry.amount.toNumber(),
      description: `REVERSAL: ${reason} (Original: ${originalTransactionRef})`,
    }));

    await this.postTransaction({
      transactionRef: reversalTransactionRef,
      transactionDate: reversalDate,
      entries: reversalEntries,
      paymentId: originalEntries[0].paymentId || undefined,
      invoiceId: originalEntries[0].invoiceId || undefined,
      customerId: originalEntries[0].customerId || undefined,
    });

    console.log('🔄 Transaction reversed:', {
      original: originalTransactionRef,
      reversal: reversalTransactionRef,
    });
  }

  /**
   * Get account balance as of a specific date
   * 
   * For ASSET and EXPENSE accounts: Balance = Total Debits - Total Credits
   * For LIABILITY, EQUITY, and REVENUE accounts: Balance = Total Credits - Total Debits
   */
  static async getAccountBalance(params: {
    accountCode: string;
    asOfDate?: Date;
  }): Promise<number> {
    const { accountCode, asOfDate } = params;

    const entries = await prisma.accountingLedger.findMany({
      where: {
        accountCode,
        ...(asOfDate && {
          transactionDate: {
            lte: asOfDate,
          },
        }),
      },
    });

    if (entries.length === 0) return 0;

    const accountType = entries[0].accountType;
    
    const totalDebits = entries
      .filter((e: any) => e.entryType === EntryType.DEBIT)
      .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

    const totalCredits = entries
      .filter((e: any) => e.entryType === EntryType.CREDIT)
      .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

    // Calculate balance based on account type
    if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
      return totalDebits - totalCredits;
    } else {
      // LIABILITY, EQUITY, REVENUE
      return totalCredits - totalDebits;
    }
  }

  /**
   * Get customer's accounts receivable balance
   * (How much the customer owes us)
   */
  static async getCustomerBalance(customerId: string): Promise<number> {
    const entries = await prisma.accountingLedger.findMany({
      where: {
        accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        customerId,
      },
    });

    const totalDebits = entries
      .filter((e: any) => e.entryType === EntryType.DEBIT)
      .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

    const totalCredits = entries
      .filter((e: any) => e.entryType === EntryType.CREDIT)
      .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

    // A/R is an asset, so Debits increase it, Credits decrease it
    return totalDebits - totalCredits;
  }

  /**
   * Verify ledger integrity
   * Ensures all transactions balance (Debits = Credits)
   */
  static async verifyLedgerIntegrity(): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Get all unique transaction references
    const transactions = await prisma.accountingLedger.groupBy({
      by: ['transactionRef'],
    });

    for (const { transactionRef } of transactions) {
      const entries = await prisma.accountingLedger.findMany({
        where: { transactionRef },
      });

      const totalDebits = entries
        .filter((e: any) => e.entryType === EntryType.DEBIT)
        .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

      const totalCredits = entries
        .filter((e: any) => e.entryType === EntryType.CREDIT)
        .reduce((sum: number, e: any) => sum + e.amount.toNumber(), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        errors.push(
          `Transaction ${transactionRef} out of balance: Debits=${totalDebits}, Credits=${totalCredits}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// UTILITY: Generate Transaction Reference
// ============================================================================

export function generateTransactionRef(prefix: string = 'TXN'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}
