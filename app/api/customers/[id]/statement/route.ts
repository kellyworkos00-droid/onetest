/**
 * Kelly OS — Customer Statement API
 * 
 * GET /api/customers/:id/statement
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCustomerStatement } from '@/lib/services/payment-processor';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerId = params.id;
    const statement = await getCustomerStatement(customerId);

    if (!statement.customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(statement);
  } catch (error: any) {
    console.error('❌ Error fetching statement:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
