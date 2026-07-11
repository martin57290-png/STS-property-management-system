import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Neon/Supabase-style pooled connection strings run through pgbouncer in
 * transaction mode, which breaks Prisma's prepared statements unless
 * pgbouncer=true is on the URL. Hosted integrations often omit it.
 */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (url && url.includes('-pooler.') && !url.includes('pgbouncer=true')) {
    return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true`;
  }
  return url;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(databaseUrl() ? { datasources: { db: { url: databaseUrl() } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
