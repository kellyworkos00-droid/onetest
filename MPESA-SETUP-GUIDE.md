# M-Pesa Payment Integration Setup Guide

## Problem: Payments Not Being Captured

Your database shows **0 payments** and **0 webhook logs**, which means M-Pesa is not calling your webhook endpoint.

## Solution: Configure M-Pesa Callback URL

### Step 1: Find Your Vercel Deployment URL

1. Go to https://vercel.com/dashboard
2. Find your project: `onetest`
3. Copy the production URL (e.g., `https://onetest-xxx.vercel.app`)

### Step 2: Your Webhook URL

Your M-Pesa callback URL should be:
```
https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa
```

Example:
```
https://onetest-git-main-kellyworkos00-droids-projects.vercel.app/api/webhooks/mpesa
```

### Step 3: Register Callback URL with Safaricom

#### Option A: Using Daraja API Console (Sandbox)
1. Log in to https://developer.safaricom.co.ke
2. Go to your app
3. Navigate to C2B API settings
4. Set **Validation URL**: `https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa`
5. Set **Confirmation URL**: `https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa`

#### Option B: Using C2B Register URL API
Run this API call to register your URLs:

```bash
curl -X POST https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "ShortCode": "YOUR_PAYBILL_NUMBER",
    "ResponseType": "Completed",
    "ConfirmationURL": "https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa",
    "ValidationURL": "https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa"
  }'
```

### Step 4: Test the Webhook Endpoint

Test if your webhook is accessible:

```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/webhooks/mpesa \\
  -H "Content-Type: application/json" \\
  -d '{
    "TransactionType": "Pay Bill",
    "TransID": "TEST123456",
    "TransTime": "20260203145030",
    "TransAmount": "1000.00",
    "BusinessShortCode": "600000",
    "BillRefNumber": "CUST001",
    "MSISDN": "254712345678",
    "FirstName": "John",
    "LastName": "Doe"
  }'
```

Expected response:
```json
{
  "ResultCode": 0,
  "ResultDesc": "Accepted"
}
```

### Step 5: Make a Test Payment

After registering the URLs, send an M-Pesa payment to your PayBill:
- **PayBill Number**: Your business shortcode
- **Account Number**: A customer ID (e.g., `CUST001`)
- **Amount**: Any amount

### Step 6: Check If Payment Was Received

Run this command to check:
```bash
npx tsx check-payments.ts
```

You should see the webhook log and payment in the database.

---

## Troubleshooting

### No Webhook Logs After Payment

**Problem**: You sent a payment but still see 0 webhook logs.

**Possible Causes**:
1. **Callback URL not registered** - Complete Step 3 above
2. **Wrong PayBill number** - Verify you're using the correct shortcode
3. **Sandbox vs Production mismatch** - Check if you're testing with sandbox credentials but sent to production (or vice versa)
4. **Network issue** - Safaricom's servers couldn't reach your Vercel URL

### Webhook Returns 500 Error

Check Vercel logs:
1. Go to https://vercel.com/dashboard
2. Open your project
3. Click "Logs" tab
4. Look for errors when webhook is called

### Payment Appears in Webhook Logs but Not in Payments Table

This means the payment processor failed. Check:
1. Customer exists with the account number used
2. Database connection is working
3. Accounting engine is properly configured

---

## Quick Verification Checklist

- [ ] Vercel deployment is successful and URL is accessible
- [ ] Webhook endpoint responds to POST requests
- [ ] Callback URL is registered with Safaricom
- [ ] Using correct PayBill number for test payments
- [ ] Account number matches an existing customer ID
- [ ] Database connection string is correct in Vercel environment variables

---

## Need Help?

If you've completed all steps and still not receiving payments, share:
1. Your Vercel deployment URL
2. Your PayBill number (or "sandbox" if testing)
3. Screenshot of Daraja portal callback URL settings
4. Any error messages from Vercel logs
