/**
 * Kelly OS — POS Sales API
 * 
 * Endpoints:
 * - POST /api/pos - Create POS sale
 * - GET /api/pos/:id - Get POS sale details
 * - GET /api/pos - List POS sales
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { POSService } from '@/lib/services/pos-service';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const POSItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
});

const CreatePOSSaleSchema = z.object({
  customerId: z.string().optional(),
  items: z.array(POSItemSchema).min(1),
  cashierId: z.string().optional(),
  branchId: z.string().optional(),
});

// ============================================================================
// GET /api/pos
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const posId = searchParams.get('posId');
    const status = searchParams.get('status');
    const branchId = searchParams.get('branchId');

    if (posId) {
      // Get specific POS sale
      const sale = await POSService.getSale(posId);

      if (!sale) {
        return NextResponse.json({ error: 'POS sale not found' }, { status: 404 });
      }

      return NextResponse.json(sale);
    }

    if (status === 'pending') {
      // Get pending sales
      const sales = await POSService.getPendingSales({
        branchId: branchId || undefined,
      });
      return NextResponse.json(sales);
    }

    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ Error fetching POS sales:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST /api/pos
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreatePOSSaleSchema.parse(body);

    const sale = await POSService.createSale({
      customerId: data.customerId,
      items: data.items,
      cashierId: data.cashierId,
      branchId: data.branchId,
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating POS sale:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
