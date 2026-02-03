/**
 * Kelly OS — Invoice Management API
 * 
 * Endpoints:
 * - POST /api/invoices - Create invoice
 * - GET /api/invoices/:id - Get invoice details
 * - GET /api/invoices - List invoices
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InvoiceService } from '@/lib/services/invoice-service';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  productId: z.string().optional(),
});

const CreateInvoiceSchema = z.object({
  customerId: z.string(),
  amount: z.number().positive(),
  description: z.string().optional(),
  dueDate: z.string().optional().transform((val: any) => (val ? new Date(val) : undefined)),
  lineItems: z.array(LineItemSchema).optional(),
});

// ============================================================================
// GET /api/invoices
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    if (invoiceId) {
      // Get specific invoice
      const invoice = await InvoiceService.getInvoice(invoiceId);

      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      return NextResponse.json(invoice);
    }

    if (customerId) {
      // Get customer invoices
      const invoices = await InvoiceService.getCustomerInvoices(customerId);
      return NextResponse.json(invoices);
    }

    if (status === 'outstanding') {
      // Get outstanding invoices
      const invoices = await InvoiceService.getOutstandingInvoices();
      return NextResponse.json(invoices);
    }

    // List all invoices (default)
    const prisma = (await import('@/lib/prisma')).default;
    const invoices = await prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            name: true,
            customerId: true
          }
        }
      },
      take: 100
    });
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error('❌ Error fetching invoices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/invoices
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateInvoiceSchema.parse(body);

    const invoice = await InvoiceService.createInvoice({
      customerId: data.customerId,
      amount: data.amount,
      description: data.description,
      dueDate: data.dueDate,
      lineItems: data.lineItems,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating invoice:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
