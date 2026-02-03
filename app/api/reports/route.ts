/**
 * Kelly OS — Accounting Reports API
 * 
 * GET /api/reports/ledger - Get ledger entries
 * GET /api/reports/balance - Get account balances
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AccountingEngine, ACCOUNTS } from '@/lib/services/accounting-engine';

// ============================================================================
// GET /api/reports/ledger
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'ledger') {
      const accountCode = searchParams.get('accountCode');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      const entries = await prisma.accountingLedger.findMany({
        where: {
          ...(accountCode && { accountCode }),
          ...(startDate &&
            endDate && {
              transactionDate: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
            }),
        },
        orderBy: { transactionDate: 'desc' },
        take: 100,
      });

      return NextResponse.json(entries);
    }

    if (type === 'balance') {
      // Get balances for all accounts
      const balances = await Promise.all(
        Object.values(ACCOUNTS).map(async (account) => {
          const balance = await AccountingEngine.getAccountBalance({
            accountCode: account.code,
          });

          return {
            code: account.code,
            name: account.name,
            type: account.type,
            balance,
          };
        })
      );

      return NextResponse.json(balances);
    }

    if (type === 'verify') {
      // Verify ledger integrity
      const result = await AccountingEngine.verifyLedgerIntegrity();
      return NextResponse.json(result);
    }

    if (type === 'dashboard') {
      // Get dashboard statistics
      const [
        totalCustomers,
        totalInvoices,
        unpaidInvoices,
        todayPayments,
      ] = await Promise.all([
        prisma.customer.count(),
        prisma.invoice.count(),
        prisma.invoice.findMany({
          where: {
            status: { in: ['UNPAID', 'PARTIALLY_PAID'] }
          }
        }),
        prisma.payment.findMany({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        })
      ]);

      const totalRevenue = await AccountingEngine.getAccountBalance({
        accountCode: ACCOUNTS.SALES_REVENUE.code
      });

      const pendingPayments = unpaidInvoices.reduce((sum, inv) => 
        sum + (Number(inv.amount) - Number(inv.amountPaid)), 0
      );

      const todayRevenue = todayPayments.reduce((sum, payment) => 
        sum + Number(payment.amount), 0
      );

      return NextResponse.json({
        totalCustomers,
        totalInvoices,
        totalRevenue: Math.abs(totalRevenue), // Revenue is credit (negative)
        pendingPayments,
        todayPayments: todayPayments.length,
        todayRevenue,
      });
    }

    if (type === 'recent-payments') {
      const limit = parseInt(searchParams.get('limit') || '20');
      
      const payments = await prisma.payment.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              name: true,
              customerId: true
            }
          }
        }
      });

      return NextResponse.json(payments);
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ Error generating report:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
