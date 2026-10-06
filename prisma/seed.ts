/**
 * Local demo data: `pnpm db:seed`. Idempotent — skips anything that exists.
 * The initial user is also created automatically on app startup.
 */
import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

async function main() {
  const email = process.env.INITIAL_USER_EMAIL?.trim().toLowerCase();
  if (email) {
    await prisma.user.upsert({ where: { email }, update: {}, create: { email } });
    console.log(`user: ${email}`);
  }

  if (await prisma.table.findUnique({ where: { slug: 'demo-clients' } })) {
    console.log('demo table already exists');
    return;
  }

  const table = await prisma.table.create({
    data: {
      name: 'Demo Clients',
      slug: 'demo-clients',
      description: 'Sample data created by prisma/seed.ts',
      columns: {
        create: [
          { name: 'Client ID', key: 'client_id', type: 'TEXT', order: 0, primary: true, required: true, unique: true },
          { name: 'Company', key: 'company', type: 'TEXT', order: 1, required: true },
          { name: 'Seats', key: 'seats', type: 'NUMBER', order: 2 },
          { name: 'Status', key: 'status', type: 'SELECT', order: 3, options: JSON.stringify({ choices: ['Active', 'Paused', 'Churned'] }) },
          { name: 'Regions', key: 'regions', type: 'MULTI_SELECT', order: 4, options: JSON.stringify({ choices: ['NA', 'EU', 'LATAM', 'APAC'] }) },
          { name: 'Renewal date', key: 'renewal_date', type: 'DATE', order: 5 },
          { name: 'Contact', key: 'contact', type: 'EMAIL', order: 6, unique: true },
          { name: 'Website', key: 'website', type: 'URL', order: 7 },
          { name: 'Strategic', key: 'strategic', type: 'BOOLEAN', order: 8 },
        ],
      },
    },
  });

  const companies = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Wonka', 'Tyrell', 'Cyberdyne', 'Soylent', 'Aperture'];
  const statuses = ['Active', 'Active', 'Paused', 'Churned'];
  const regions = ['NA', 'EU', 'LATAM', 'APAC'];
  await prisma.row.createMany({
    data: companies.map((company, i) => ({
      tableId: table.id,
      data: JSON.stringify({
        client_id: `CL-${String(i + 1).padStart(4, '0')}`,
        company,
        seats: (i + 1) * 7,
        status: statuses[i % statuses.length],
        regions: [regions[i % 4], regions[(i + 1) % 4]],
        renewal_date: `2027-${String((i % 12) + 1).padStart(2, '0')}-15`,
        contact: `ops@${company.toLowerCase()}.example`,
        website: `https://${company.toLowerCase()}.example`,
        strategic: i % 3 === 0,
      }),
    })),
  });
  console.log(`created table demo-clients with ${companies.length} rows`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
