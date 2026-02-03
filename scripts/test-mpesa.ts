/**
 * Test M-Pesa Connection
 * 
 * Run this script to verify your M-Pesa credentials and connection
 * 
 * Usage:
 *   npx ts-node scripts/test-mpesa.ts
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { createMpesaClient } from '../lib/mpesa-client';

async function testMpesaConnection() {
  console.log('🧪 Testing M-Pesa Connection...\n');

  try {
    // Create M-Pesa client
    const mpesa = createMpesaClient();
    console.log('✅ M-Pesa client created');
    console.log(`   Environment: ${process.env.MPESA_ENVIRONMENT}`);
    console.log(`   Short Code: ${process.env.MPESA_SHORT_CODE}\n`);

    // Test 1: Get Access Token
    console.log('🔑 Test 1: Getting OAuth Access Token...');
    const token = await (mpesa as any).getAccessToken();
    console.log('✅ Access Token obtained:', token.substring(0, 20) + '...\n');

    // Test 2: Register C2B URLs (commented out to avoid duplicate registration)
    // Uncomment this when you're ready to register your callback URLs
    /*
    console.log('📝 Test 2: Registering C2B URLs...');
    const registerResult = await mpesa.registerC2B({
      shortCode: process.env.MPESA_SHORT_CODE!,
      confirmationURL: process.env.MPESA_CALLBACK_URL!,
      validationURL: process.env.MPESA_CALLBACK_URL!,
    });
    console.log('✅ C2B URLs registered:', registerResult, '\n');
    */

    // Test 3: Simulate C2B Payment (Sandbox only)
    if (process.env.MPESA_ENVIRONMENT === 'sandbox') {
      console.log('💰 Test 3: Simulating C2B Payment...');
      const simulateResult = await mpesa.simulateC2B({
        amount: 100,
        msisdn: '254708374149', // Sandbox test number
        billRefNumber: 'TEST-001',
      });
      console.log('✅ C2B Payment simulated:', simulateResult, '\n');
    }

    console.log('✅ All tests passed! M-Pesa connection is working.\n');
    console.log('Next steps:');
    console.log('1. Uncomment the C2B registration test to register your callback URLs');
    console.log('2. Start your server: npm run dev');
    console.log('3. Expose your webhook endpoint (use ngrok for testing)');
    console.log('4. Test actual payments\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('   Response:', error.response.data);
      console.error('   Status:', error.response.status);
    }

    console.error('\nTroubleshooting:');
    console.error('- Check your Consumer Key and Secret in .env');
    console.error('- Verify you\'re using the correct environment (sandbox/production)');
    console.error('- Ensure your IP is whitelisted on Safaricom Developer Portal\n');
    
    process.exit(1);
  }
}

// Run the test
testMpesaConnection();
