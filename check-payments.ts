import prisma from './lib/prisma';

async function checkPayments() {
  try {
    // Check recent payments
    const payments = await prisma.payment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, invoices: true },
    });

    console.log('\n=== RECENT PAYMENTS ===');
    console.log(`Total found: ${payments.length}\n`);
    
    payments.forEach((payment, index) => {
      console.log(`Payment ${index + 1}:`);
      console.log(`  ID: ${payment.id}`);
      console.log(`  M-Pesa Receipt: ${payment.mpesaReceiptNumber}`);
      console.log(`  Amount: KES ${payment.amount}`);
      console.log(`  Phone: ${payment.phone}`);
      console.log(`  Customer: ${payment.customer?.name || 'N/A'}`);
      console.log(`  Status: ${payment.status}`);
      console.log(`  Created: ${payment.createdAt}`);
      console.log('---');
    });

    // Check webhook logs
    const webhookLogs = await prisma.webhookLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    console.log('\n=== RECENT WEBHOOK LOGS ===');
    console.log(`Total found: ${webhookLogs.length}\n`);
    
    webhookLogs.forEach((log, index) => {
      console.log(`Webhook ${index + 1}:`);
      console.log(`  ID: ${log.id}`);
      console.log(`  M-Pesa Receipt: ${log.mpesaReceiptNumber}`);
      console.log(`  Processed: ${log.processed}`);
      console.log(`  Duplicate: ${log.isDuplicate}`);
      console.log(`  Error: ${log.processingError || 'None'}`);
      console.log(`  Created: ${log.createdAt}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPayments();
