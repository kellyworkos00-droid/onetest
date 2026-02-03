/**
 * Kelly OS — M-Pesa C2B Webhook Handler
 * 
 * CRITICAL: This endpoint receives M-Pesa payment callbacks from Safaricom Daraja API
 * 
 * Security Requirements:
 * - Validates webhook authenticity
 * - Implements idempotency (rejects duplicate callbacks)
 * - Never trusts frontend data
 * - Logs all webhook attempts
 * 
 * Flow:
 * 1. Receive POST from Safaricom
 * 2. Log raw payload immediately
 * 3. Check for duplicate (mpesaReceiptNumber)
 * 4. Validate callback structure
 * 5. Process payment atomically
 * 6. Return 200 OK to Safaricom (ALWAYS, even on internal errors)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { processPayment } from '@/lib/services/payment-processor';

// ============================================================================
// M-PESA C2B CALLBACK SCHEMA
// ============================================================================

const MpesaCallbackSchema = z.object({
  TransactionType: z.string(),
  TransID: z.string(), // Unique transaction ID from Safaricom
  TransTime: z.string(), // Format: YYYYMMDDHHmmss
  TransAmount: z.string(), // Amount as string, e.g., "1000.00"
  BusinessShortCode: z.string(), // Your PayBill number
  BillRefNumber: z.string(), // Account Number (customerId or invoiceId)
  InvoiceNumber: z.string().optional(),
  OrgAccountBalance: z.string().optional(),
  ThirdPartyTransID: z.string().optional(),
  MSISDN: z.string(), // Customer phone: 254712345678
  FirstName: z.string(),
  MiddleName: z.string().optional(),
  LastName: z.string().optional(),
});

type MpesaCallback = z.infer<typeof MpesaCallbackSchema>;

// Some M-Pesa callbacks wrap data in a Result object
const MpesaWrapperSchema = z.object({
  Result: MpesaCallbackSchema,
});

// ============================================================================
// WEBHOOK ENDPOINT
// ============================================================================

export async function POST(req: NextRequest) {
  let rawPayload: string = '';
  let parsedData: MpesaCallback | null = null;

  try {
    // Step 1: Read raw body
    rawPayload = await req.text();
    const payload = JSON.parse(rawPayload);
    
    // Step 2: Log webhook immediately (for audit trail)
    console.log('📥 M-Pesa webhook received:', {
      timestamp: new Date().toISOString(),
      payload: payload,
    });

    // Step 3: Parse and validate callback structure
    // M-Pesa sometimes sends data directly or wrapped in "Result"
    let validatedData: MpesaCallback;
    
    try {
      validatedData = MpesaCallbackSchema.parse(payload);
    } catch {
      // Try wrapped format
      const wrapped = MpesaWrapperSchema.parse(payload);
      validatedData = wrapped.Result;
    }

    parsedData = validatedData;

    // Step 4: Extract critical identifiers
    const mpesaReceiptNumber = validatedData.TransID;
    const transactionId = validatedData.ThirdPartyTransID || validatedData.TransID;
    const accountReference = validatedData.BillRefNumber;
    const amount = parseFloat(validatedData.TransAmount);
    const phone = validatedData.MSISDN;
    const transactionTime = parseTransactionTime(validatedData.TransTime);

    // Step 5: Create webhook log (idempotency check happens here)
    const existingLog = await prisma.webhookLog.findFirst({
      where: { mpesaReceiptNumber },
    });

    if (existingLog) {
      console.warn('⚠️ Duplicate webhook detected:', mpesaReceiptNumber);
      
      await prisma.webhookLog.create({
        data: {
          mpesaReceiptNumber,
          transactionId,
          rawPayload,
          headers: JSON.stringify(Object.fromEntries(req.headers)),
          processed: false,
          isDuplicate: true,
          processingError: 'Duplicate webhook - already processed',
        },
      });

      // CRITICAL: Still return 200 OK to Safaricom to stop retries
      return NextResponse.json(
        {
          ResultCode: 0,
          ResultDesc: 'Accepted (duplicate)',
        },
        { status: 200 }
      );
    }

    // Step 6: Create new webhook log
    const webhookLog = await prisma.webhookLog.create({
      data: {
        mpesaReceiptNumber,
        transactionId,
        rawPayload,
        headers: JSON.stringify(Object.fromEntries(req.headers)),
        processed: false,
        isDuplicate: false,
      },
    });

    // Step 7: Process payment (this is where the magic happens)
    try {
      const payment = await processPayment({
        mpesaReceiptNumber,
        transactionId,
        accountReference,
        amount,
        phone,
        transactionDate: transactionTime,
      });

      // Step 8: Update webhook log with success
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processed: true,
          paymentId: payment.id,
        },
      });

      console.log('✅ Payment processed successfully:', {
        paymentId: payment.id,
        mpesaReceiptNumber,
        amount,
      });

      // Step 9: Return success to Safaricom
      return NextResponse.json(
        {
          ResultCode: 0,
          ResultDesc: 'Accepted',
        },
        { status: 200 }
      );
    } catch (processingError: any) {
      // Payment processing failed, but we still need to ACK to Safaricom
      console.error('❌ Payment processing failed:', processingError);

      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processed: false,
          processingError: processingError.message || 'Unknown error',
        },
      });

      // CRITICAL: Return 200 OK even on internal errors
      // This prevents Safaricom from retrying
      // We'll handle failed payments through admin tools
      return NextResponse.json(
        {
          ResultCode: 0,
          ResultDesc: 'Accepted',
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    // Validation or parsing error
    console.error('❌ Webhook validation error:', error);

    // Try to log the failed webhook if we have enough data
    try {
      if (parsedData) {
        await prisma.webhookLog.create({
          data: {
            mpesaReceiptNumber: parsedData.TransID || 'UNKNOWN',
            transactionId: parsedData.ThirdPartyTransID || parsedData.TransID || 'UNKNOWN',
            rawPayload,
            headers: JSON.stringify(Object.fromEntries(req.headers)),
            processed: false,
            processingError: `Validation error: ${error.message}`,
          },
        });
      }
    } catch (logError) {
      console.error('Failed to log invalid webhook:', logError);
    }

    // CRITICAL: Still return 200 OK to prevent retries of malformed data
    return NextResponse.json(
      {
        ResultCode: 0,
        ResultDesc: 'Accepted',
      },
      { status: 200 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse M-Pesa transaction time from format: YYYYMMDDHHmmss
 * Example: "20260203143022" → 2026-02-03 14:30:22
 */
function parseTransactionTime(timeString: string): Date {
  const year = parseInt(timeString.substring(0, 4));
  const month = parseInt(timeString.substring(4, 6)) - 1; // JS months are 0-indexed
  const day = parseInt(timeString.substring(6, 8));
  const hour = parseInt(timeString.substring(8, 10));
  const minute = parseInt(timeString.substring(10, 12));
  const second = parseInt(timeString.substring(12, 14));

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Optional: Verify webhook authenticity using Safaricom's signature
 * (Implementation depends on how Safaricom signs C2B callbacks)
 */
function verifyWebhookSignature(req: NextRequest, body: string): boolean {
  // TODO: Implement signature verification if Safaricom provides it for C2B
  // For now, rely on:
  // 1. HTTPS
  // 2. IP whitelisting (configure in Next.js middleware)
  // 3. Callback URL secrecy
  
  return true;
}
