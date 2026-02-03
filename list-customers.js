const prisma = require('./lib/prisma').default;

async function run() {
  const customers = await prisma.customer.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  console.log(customers.map((c) => ({
    id: c.id,
    customerId: c.customerId,
    name: c.name,
    phone: c.phone,
  })));
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  prisma.$disconnect();
});
