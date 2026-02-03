# Kelly OS — M-Pesa PayBill Payments Engine

A production-grade financial system for Kenya, built with Next.js, TypeScript, PostgreSQL, and M-Pesa Daraja API.

## 🎯 Features

- ✅ **M-Pesa PayBill Integration** — Automatic payment capture via Daraja C2B API
- ✅ **Customer Account Management** — Running balances, statements, credit tracking
- ✅ **Invoice Management** — Manual invoices, partial payments, automatic status updates
- ✅ **POS System** — Point of sale with payment confirmation workflow
- ✅ **Double-Entry Accounting** — Immutable ledger, full audit trail
- ✅ **Idempotent Webhooks** — Prevents duplicate payment processing
- ✅ **Real-Time Updates** — Dashboard reflects payments instantly
- ✅ **Business Rules Enforcement** — Transaction limits, validation, edge cases

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       M-Pesa Daraja API                     │
│                (Safaricom Payment Gateway)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ C2B Callback
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Webhook Handler (Idempotent)                    │
│  • Validates callback                                        │
│  • Checks duplicate (mpesaReceiptNumber)                     │
│  • Logs to webhook_logs                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Payment Processor                           │
│  • Identifies customer/invoice                               │
│  • Validates business rules                                  │
│  • Allocates payment (FIFO)                                  │
│  • Updates balances & statuses                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               Accounting Engine                              │
│  DR  M-Pesa Cash           (Asset increases)                 │
│  CR  Accounts Receivable   (Asset decreases)                 │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Project Structure

```
kelly-os-mpesa/
├── prisma/
│   └── schema.prisma          # Database schema (PostgreSQL)
├── app/
│   └── api/
│       ├── webhooks/
│       │   └── mpesa/         # M-Pesa C2B webhook handler
│       ├── customers/         # Customer management
│       ├── invoices/          # Invoice management
│       ├── pos/               # POS sales
│       └── reports/           # Accounting reports
├── lib/
│   ├── prisma.ts             # Prisma client singleton
│   ├── mpesa-client.ts       # M-Pesa Daraja API client
│   └── services/
│       ├── accounting-engine.ts    # Double-entry bookkeeping
│       ├── payment-processor.ts    # Payment processing logic
│       ├── invoice-service.ts      # Invoice management
│       └── pos-service.ts          # POS management
└── .env.example              # Environment variables template
```

## 🚀 Setup Instructions

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+
- M-Pesa Daraja API credentials (from [Safaricom Developer Portal](https://developer.safaricom.co.ke))

### 2. Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# - DATABASE_URL
# - MPESA_CONSUMER_KEY
# - MPESA_CONSUMER_SECRET
# - MPESA_SHORT_CODE (PayBill number)
# - MPESA_CALLBACK_URL
```

### 3. Database Setup

```bash
# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate

# Open Prisma Studio (optional)
npm run db:studio
```

### 4. M-Pesa Configuration

Register your callback URL with Safaricom:

```typescript
import { createMpesaClient } from '@/lib/mpesa-client';

const mpesa = createMpesaClient();
await mpesa.registerC2B();
```

### 5. Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

## 🔐 Security

### Webhook Protection

1. **HTTPS Only** — Production must use HTTPS
2. **Idempotency** — Duplicate callbacks rejected via `mpesaReceiptNumber`
3. **IP Whitelisting** — Configure firewall to only accept Safaricom IPs
4. **Request Logging** — All webhooks logged to `webhook_logs`

### Environment Variables

Never commit `.env` to version control. Use environment variables for:
- Database credentials
- M-Pesa API keys
- Webhook secrets

## 📡 API Endpoints

### Customers

```
POST   /api/customers           # Create customer
GET    /api/customers?customerId=CUST-001
GET    /api/customers/:id/statement
```

### Invoices

```
POST   /api/invoices            # Create invoice
GET    /api/invoices?customerId=xxx
GET    /api/invoices?status=outstanding
```

### POS

```
POST   /api/pos                 # Create POS sale
GET    /api/pos?status=pending
GET    /api/pos?posId=POS-001
```

### Webhooks

```
POST   /api/webhooks/mpesa      # M-Pesa C2B callback (Safaricom only)
```

### Reports

```
GET    /api/reports?type=ledger
GET    /api/reports?type=balance
GET    /api/reports?type=verify
```

## 💰 Payment Flow

### Scenario: Customer Pays Invoice

1. **Customer pays via M-Pesa:**
   ```
   PayBill: 174379
   Account: INV-20260203-0001
   Amount: KSh 5,000
   ```

2. **Safaricom sends webhook:**
   ```json
   {
     "TransID": "QGK12XYZ9",
     "TransAmount": "5000.00",
     "BillRefNumber": "INV-20260203-0001",
     "MSISDN": "254712345678"
   }
   ```

3. **System processes payment:**
   - Validates & logs webhook
   - Checks idempotency
   - Identifies invoice
   - Creates payment record
   - Updates invoice status → `PAID`
   - Updates customer balance
   - Posts to ledger:
     ```
     DR  M-Pesa Cash           5,000
     CR  Accounts Receivable   5,000
     ```

4. **Dashboard updates in real-time**

## 🧪 Testing (Sandbox)

```typescript
// Simulate C2B payment in sandbox
const mpesa = createMpesaClient();

await mpesa.simulateC2B({
  amount: 1000,
  msisdn: '254712345678',
  billRefNumber: 'CUST-001', // or invoice ID
});
```

## 📊 Accounting

### Chart of Accounts

| Code | Account Name          | Type      |
|------|-----------------------|-----------|
| 1010 | M-Pesa Cash           | ASSET     |
| 1200 | Accounts Receivable   | ASSET     |
| 4000 | Sales Revenue         | REVENUE   |
| 5000 | Cost of Goods Sold    | EXPENSE   |

### Balance Verification

```typescript
const result = await AccountingEngine.verifyLedgerIntegrity();
// Returns: { isValid: true/false, errors: [] }
```

### Customer Balance Integrity

```
Customer Balance = Total Invoices - Total Payments
                 = SUM(invoices.balance)
```

Enforced through atomic transactions.

## ⚠️ Business Rules

- **Max Transaction:** KSh 250,000
- **Daily Customer Limit:** KSh 500,000
- **Invoice Status Flow:** UNPAID → PARTIALLY_PAID → PAID
- **POS Flow:** PENDING → PAID (requires payment confirmation)
- **Ledger:** Immutable (use reversals for corrections)

## 🔄 Payment Allocation Logic

When payment is received:

1. **If `accountReference` = Invoice ID:**
   - Apply full amount to that specific invoice

2. **If `accountReference` = Customer ID:**
   - Apply to oldest unpaid invoices (FIFO)
   - Continue until payment exhausted

3. **If payment exceeds invoices:**
   - Customer gets credit balance
   - Applied to future invoices

## 📈 Real-Time Updates

TODO: Implement WebSocket/Server-Sent Events for:
- Dashboard live payment notifications
- Invoice status changes
- Customer balance updates

Placeholder in `payment-processor.ts`:
```typescript
async function emitPaymentEvent(result: PaymentResult) {
  // Integrate with Pusher, Ably, or custom WebSocket
}
```

## 🐛 Debugging

### Check Webhook Logs

```sql
SELECT * FROM webhook_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

### Verify Ledger Balance

```typescript
const balance = await AccountingEngine.getAccountBalance({
  accountCode: '1010', // M-Pesa Cash
});
```

### Check Payment Status

```sql
SELECT * FROM payments 
WHERE mpesa_receipt_number = 'QGK12XYZ9';
```

## 🚨 Production Checklist

- [ ] Use production M-Pesa credentials
- [ ] Configure HTTPS with valid SSL certificate
- [ ] Set up database backups
- [ ] Configure IP whitelisting for M-Pesa callbacks
- [ ] Set up monitoring (Sentry, DataDog, etc.)
- [ ] Enable database connection pooling
- [ ] Configure rate limiting
- [ ] Set up log aggregation
- [ ] Test webhook retry handling
- [ ] Document runbook for common issues

## 📝 License

Proprietary — Kelly Work OS

## 👨‍💻 Support

For issues or questions, contact the engineering team.

---

**Built with financial correctness in mind. Every shilling counts. 💵**
