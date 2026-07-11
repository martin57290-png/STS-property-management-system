/**
 * CLI entry for the demo seed. Run with:  npm run db:seed
 * All seed logic lives in prisma/seed-core.ts so the deployed app's
 * /api/setup route can run the identical seed.
 */
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed-core';

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
