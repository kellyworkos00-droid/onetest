// Test M-Pesa webhook locally before deploying
// This simulates what Safaricom's callback would send

const testPayload = {
  TransactionType: 'Pay Bill',
  TransID: 'TEST' + Date.now(), // Unique transaction ID
  TransTime: new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14), // YYYYMMDDHHmmss
  TransAmount: '1500.00',
  BusinessShortCode: '600000',
  BillRefNumber: 'CUST001', // This should match a customer ID
  MSISDN: '254712345678',
  FirstName: 'Test',
  LastName: 'Customer',
};

async function testWebhook() {
  console.log('📤 Sending test webhook...\n');
  console.log('Payload:', JSON.stringify(testPayload, null, 2));
  console.log('\n---\n');

  try {
    const response = await fetch('http://localhost:3000/api/webhooks/mpesa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();
    
    console.log(`✅ Response Status: ${response.status}`);
    console.log('Response Body:', JSON.stringify(result, null, 2));

    if (response.status === 200) {
      console.log('\n✅ SUCCESS! Webhook accepted.');
      console.log('\nNow run: npx tsx check-payments.ts');
      console.log('You should see the payment in the database.');
    } else {
      console.log('\n❌ ERROR: Unexpected response status');
    }
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\nMake sure:');
    console.log('1. Your dev server is running: npm run dev');
    console.log('2. You have a customer with ID: CUST001');
    console.log('\nTo create a test customer:');
    console.log('  Open http://localhost:3000');
    console.log('  Go to Customers tab');
    console.log('  Create customer with ID: CUST001');
  }
}

testWebhook();
