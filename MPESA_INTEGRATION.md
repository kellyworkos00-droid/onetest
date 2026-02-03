# Kelly OS — M-Pesa Integration Guide

## 🎯 Quick Start

### 1. Get M-Pesa Credentials

1. Visit [Safaricom Developer Portal](https://developer.safaricom.co.ke)
2. Create an app
3. Get:
   - Consumer Key
   - Consumer Secret
   - Short Code (PayBill number)
   - Passkey

### 2. Register Callback URL

The callback URL is where Safaricom sends payment notifications.

**Sandbox:**
```
https://your-domain.com/api/webhooks/mpesa
```

**Production:**
```
https://kelly-os.com/api/webhooks/mpesa
```

Run this code once to register:

```typescript
import { createMpesaClient } from '@/lib/mpesa-client';

const mpesa = createMpesaClient();
const result = await mpesa.registerC2B({
  shortCode: '174379',
  responseType: 'Completed',
  confirmationURL: 'https://your-domain.com/api/webhooks/mpesa',
  validationURL: 'https://your-domain.com/api/webhooks/mpesa',
});

console.log(result);
// Expected: { ResponseDescription: "Success" }
```

### 3. Test in Sandbox

```typescript
// Simulate a customer payment
const mpesa = createMpesaClient();

await mpesa.simulateC2B({
  amount: 1000,
  msisdn: '254712345678',
  billRefNumber: 'CUST-001', // Customer ID or Invoice ID
});
```

This will trigger a callback to your webhook endpoint.

## 📱 Customer Payment Instructions

### To Pay an Invoice

```
1. Go to M-Pesa menu
2. Select "Lipa na M-Pesa"
3. Select "Pay Bill"
4. Enter Business Number: 174379
5. Enter Account Number: INV-20260203-0001
6. Enter Amount: 5000
7. Enter M-Pesa PIN
8. Confirm
```

### To Pay on Account (General Payment)

```
Account Number: CUST-001 (Customer ID)
```

The system will:
- Apply payment to oldest unpaid invoices (FIFO)
- Create credit balance if payment exceeds invoices

## 🔧 Webhook Details

### Expected Callback Format

```json
{
  "TransactionType": "Pay Bill",
  "TransID": "QGK12XYZ9",
  "TransTime": "20260203143022",
  "TransAmount": "5000.00",
  "BusinessShortCode": "174379",
  "BillRefNumber": "INV-20260203-0001",
  "MSISDN": "254712345678",
  "FirstName": "JOHN",
  "LastName": "DOE"
}
```

### Idempotency

The system uses `TransID` (M-Pesa Receipt Number) to prevent duplicate processing.

If Safaricom retries the webhook, the system will:
1. Detect duplicate via `mpesa_receipt_number`
2. Log it as duplicate
3. Return 200 OK (to stop retries)
4. NOT process payment again

### Failure Handling

Even if internal processing fails, the webhook **always returns 200 OK** to Safaricom.

Why? To prevent infinite retries.

Failed payments are logged and can be reprocessed manually.

## 🧪 Testing Scenarios

### Test 1: Invoice Payment

```typescript
// 1. Create customer
const customer = await prisma.customer.create({
  data: {
    customerId: 'CUST-TEST-001',
    name: 'Test Customer',
    phone: '254712345678',
    balance: 0,
  },
});

// 2. Create invoice
const invoice = await InvoiceService.createInvoice({
  customerId: customer.id,
  amount: 5000,
  description: 'Test Invoice',
});

// 3. Simulate payment
await mpesa.simulateC2B({
  amount: 5000,
  msisdn: '254712345678',
  billRefNumber: invoice.invoiceId, // INV-20260203-0001
});

// 4. Check results
const updatedInvoice = await prisma.invoice.findUnique({
  where: { id: invoice.id },
});
console.log(updatedInvoice.status); // Should be "PAID"

const updatedCustomer = await prisma.customer.findUnique({
  where: { id: customer.id },
});
console.log(updatedCustomer.balance); // Should be 0
```

### Test 2: Partial Payment

```typescript
// Invoice for KSh 10,000
const invoice = await InvoiceService.createInvoice({
  customerId: customer.id,
  amount: 10000,
});

// Pay KSh 3,000
await mpesa.simulateC2B({
  amount: 3000,
  msisdn: '254712345678',
  billRefNumber: invoice.invoiceId,
});

const updatedInvoice = await prisma.invoice.findUnique({
  where: { id: invoice.id },
});

console.log(updatedInvoice.status); // "PARTIALLY_PAID"
console.log(updatedInvoice.amountPaid); // 3000
console.log(updatedInvoice.balance); // 7000
```

### Test 3: Overpayment

```typescript
// Invoice for KSh 5,000
const invoice = await InvoiceService.createInvoice({
  customerId: customer.id,
  amount: 5000,
});

// Pay KSh 7,000
await mpesa.simulateC2B({
  amount: 7000,
  msisdn: '254712345678',
  billRefNumber: invoice.invoiceId,
});

const updatedCustomer = await prisma.customer.findUnique({
  where: { id: customer.id },
});

// Invoice fully paid
const updatedInvoice = await prisma.invoice.findUnique({
  where: { id: invoice.id },
});
console.log(updatedInvoice.status); // "PAID"

// Customer has credit balance of KSh 2,000
console.log(updatedCustomer.balance); // -2000 (credit)
```

### Test 4: POS Flow

```typescript
// 1. Create POS sale
const sale = await POSService.createSale({
  items: [
    {
      productId: 'PROD-001',
      productName: 'Coca Cola',
      quantity: 2,
      unitPrice: 50,
    },
  ],
});

console.log(sale.status); // "PENDING"

// 2. Customer pays using POS ID
await mpesa.simulateC2B({
  amount: 100,
  msisdn: '254712345678',
  billRefNumber: sale.posId, // POS-20260203-0001
});

// 3. Check POS sale status
const updatedSale = await prisma.pOSSale.findUnique({
  where: { id: sale.id },
});
console.log(updatedSale.status); // "PAID"
console.log(updatedSale.invoiceId); // Auto-created invoice ID
```

## 🚨 Common Issues

### Issue: Callback not received

**Causes:**
1. Callback URL not registered
2. Server not accessible (firewall, down, etc.)
3. Wrong environment (sandbox vs production)

**Solution:**
- Re-register callback URL
- Check server logs
- Verify webhook endpoint is publicly accessible
- Test with `curl`:
  ```bash
  curl -X POST https://your-domain.com/api/webhooks/mpesa \
    -H "Content-Type: application/json" \
    -d '{"TransID":"TEST123","TransAmount":"100.00",...}'
  ```

### Issue: Payment processed twice

**Should not happen** due to idempotency checks.

If it does:
1. Check `webhook_logs` table
2. Verify `mpesa_receipt_number` uniqueness
3. Review transaction logs

### Issue: Payment not clearing invoice

**Causes:**
1. Account reference doesn't match customer/invoice ID
2. Customer not found
3. Invoice already paid

**Solution:**
- Check `webhook_logs.raw_payload` for actual `BillRefNumber`
- Verify customer/invoice IDs match
- Check case sensitivity

## 📊 Monitoring

### Key Metrics

1. **Webhook Success Rate**
   ```sql
   SELECT 
     COUNT(*) as total,
     SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as successful,
     SUM(CASE WHEN is_duplicate = true THEN 1 ELSE 0 END) as duplicates
   FROM webhook_logs
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Daily Payment Volume**
   ```sql
   SELECT 
     DATE(transaction_date) as date,
     COUNT(*) as count,
     SUM(amount) as total_amount
   FROM payments
   WHERE status = 'COMPLETED'
   GROUP BY DATE(transaction_date)
   ORDER BY date DESC;
   ```

3. **Failed Webhooks**
   ```sql
   SELECT * FROM webhook_logs
   WHERE processed = false AND is_duplicate = false
   ORDER BY created_at DESC;
   ```

## 🔒 Security Best Practices

1. **Use HTTPS** — Required for production
2. **IP Whitelist** — Only allow Safaricom IPs
3. **Environment Variables** — Never hardcode credentials
4. **Rate Limiting** — Prevent abuse
5. **Logging** — Log all webhook attempts
6. **Monitoring** — Alert on failed webhooks

## 📞 Safaricom Support

- **Developer Portal:** https://developer.safaricom.co.ke
- **Support Email:** apisupport@safaricom.co.ke
- **Sandbox Testing:** Open 24/7
- **Production Support:** Business hours (EAT)

---

**Need help? Contact the engineering team.**
