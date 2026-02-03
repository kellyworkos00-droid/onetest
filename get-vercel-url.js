#!/usr/bin/env node

/**
 * Get your Vercel deployment URL
 * This helps you find the correct webhook URL to register with M-Pesa
 */

const { execSync } = require('child_process');

console.log('🔍 Finding your Vercel deployment URL...\n');

try {
  // Try to get the URL from Vercel CLI
  const output = execSync('vercel ls --yes', { encoding: 'utf-8' });
  
  console.log('Recent deployments:');
  console.log(output);
  
  // Extract production URL
  const lines = output.split('\n');
  const productionLine = lines.find(line => line.includes('Production'));
  
  if (productionLine) {
    const match = productionLine.match(/https:\/\/[^\s]+/);
    if (match) {
      const url = match[0];
      console.log('\n✅ PRODUCTION URL FOUND:');
      console.log(`   ${url}`);
      console.log('\n📝 Your M-Pesa Webhook URL:');
      console.log(`   ${url}/api/webhooks/mpesa`);
      console.log('\n👉 Register this URL in Safaricom Daraja Portal');
    }
  }
} catch (error) {
  console.log('⚠️  Could not run Vercel CLI\n');
  console.log('Alternative methods to find your URL:\n');
  
  console.log('METHOD 1: Check Vercel Dashboard');
  console.log('  1. Go to https://vercel.com/dashboard');
  console.log('  2. Find project: onetest');
  console.log('  3. Copy the production URL\n');
  
  console.log('METHOD 2: Check GitHub');
  console.log('  1. Go to https://github.com/kellyworkos00-droid/onetest');
  console.log('  2. Look for Vercel deployment status');
  console.log('  3. Click to see the URL\n');
  
  console.log('METHOD 3: Manual format');
  console.log('  Your URL is likely:');
  console.log('  https://onetest-[random].vercel.app');
  console.log('  or');
  console.log('  https://onetest-git-main-[username].vercel.app\n');
  
  console.log('Once you have the URL, your webhook URL will be:');
  console.log('  [YOUR-URL]/api/webhooks/mpesa');
}
