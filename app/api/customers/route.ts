/**
 * Kelly OS — Customer Management API
 * 
 * Endpoints:
 * - POST /api/customers - Create customer
 * - GET /api/customers/:id - Get customer details
 * - GET /api/customers/:id/statement - Get customer statement
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const normalizePhone = (value: string) => {
  const cleaned = value.replace(/\s+/g, '').replace(/^\+/, '');
  if (/^0\d{9}$/.test(cleaned)) {
    return `254${cleaned.slice(1)}`;
  }
  if (/^7\d{8}$/.test(cleaned)) {
    return `254${cleaned}`;
  }
  return cleaned;
};

const CreateCustomerSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  phone: z
    .string()
    .min(1)
    .transform((val) => normalizePhone(val))
    .refine((val) => /^254\d{9}$/.test(val), {
      message: 'Phone must be in format 254XXXXXXXXX',
    }),
  email: z.string().email().optional(),
});

// ============================================================================
// GET /api/customers
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const phone = searchParams.get('phone');

    if (customerId) {
      // Get specific customer
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [{ id: customerId }, { customerId }],
        },
        include: {
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          payments: {
            orderBy: { transactionDate: 'desc' },
            take: 10,
          },
        },
      });

      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      return NextResponse.json(customer);
    }

    if (phone) {
      // Search by phone
      const customer = await prisma.customer.findFirst({
        where: { phone },
      });

      return NextResponse.json(customer);
    }

    // List all customers
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching customers:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/customers
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateCustomerSchema.parse(body);

    // Check if customer already exists
    const existing = await prisma.customer.findFirst({
      where: {
        OR: [{ customerId: data.customerId }, { phone: data.phone }],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Customer already exists' },
        { status: 400 }
      );
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        customerId: data.customerId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        balance: new Prisma.Decimal(0),
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating customer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
