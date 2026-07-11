import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import {
  MIGRATION_CHECKSUM,
  MIGRATION_NAME,
  MIGRATION_SQL,
} from '@/lib/setup/migration-sql';
import { seedDatabase } from '../../../../prisma/seed-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-time bootstrap for hosted deployments (e.g. Vercel + Neon) where the
 * database is only reachable from the app itself: creates the schema from
 * the checked-in initial migration, records it in _prisma_migrations, and
 * loads the demo seed.
 *
 * Guarded by FILE_SIGNING_SECRET:  GET /api/setup?key=<FILE_SIGNING_SECRET>
 * Refuses to touch a database that already has users unless &force=1.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.FILE_SIGNING_SECRET;
  if (!expected) {
    return page(500, 'Setup unavailable', [
      'FILE_SIGNING_SECRET is not set in this deployment.',
      'Add it under Settings → Environment Variables, redeploy, then try again.',
    ]);
  }
  const raw = req.nextUrl.searchParams.get('key') ?? '';
  // Tolerate '+' in the secret being decoded as a space when pasted unencoded.
  if (raw !== expected && raw.replace(/ /g, '+') !== expected) {
    return page(403, 'Forbidden', ['Missing or incorrect key.']);
  }

  const steps: string[] = [];
  try {
    const [{ exists: hasSchema }] = await prisma.$queryRawUnsafe<[{ exists: boolean }]>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'User'
       ) AS exists`,
    );

    if (!hasSchema) {
      for (const stmt of splitStatements(MIGRATION_SQL)) {
        await prisma.$executeRawUnsafe(stmt);
      }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          id                  VARCHAR(36) PRIMARY KEY,
          checksum            VARCHAR(64) NOT NULL,
          finished_at         TIMESTAMPTZ,
          migration_name      VARCHAR(255) NOT NULL,
          logs                TEXT,
          rolled_back_at      TIMESTAMPTZ,
          started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        )`);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, 1) ON CONFLICT DO NOTHING`
          .replace('$1', `'${randomUUID()}'`)
          .replace('$2', `'${MIGRATION_CHECKSUM}'`)
          .replace('$3', `'${MIGRATION_NAME}'`),
      );
      steps.push('Created database schema (initial migration applied).');
    } else {
      steps.push('Schema already exists — skipped migration.');
    }

    const userCount = await prisma.user.count();
    const force = req.nextUrl.searchParams.get('force') === '1';
    if (userCount > 0 && !force) {
      return page(200, 'Already set up', [
        ...steps,
        `Database already contains ${userCount} users — seed skipped.`,
        'Add &force=1 to the URL to wipe and re-seed with fresh demo data.',
        'Sign in at /login — landlord: admin@stspm.com / admin1234',
      ]);
    }

    await seedDatabase(prisma);
    steps.push('Demo data loaded: 5 properties, 40 units, tenants, ledgers, applications, work orders, inspections.');

    const host = req.headers.get('host') ?? '';
    const nextauthUrl = process.env.NEXTAUTH_URL ?? '';
    if (host && nextauthUrl && !nextauthUrl.includes(host)) {
      steps.push(
        `⚠ NEXTAUTH_URL is "${nextauthUrl}" but this site is "${host}" — sign-in will fail until NEXTAUTH_URL and APP_URL are set to https://${host} (then redeploy).`,
      );
    } else if (!nextauthUrl) {
      steps.push(
        `⚠ NEXTAUTH_URL is not set — add NEXTAUTH_URL and APP_URL = https://${host} in Environment Variables, then redeploy, or sign-in may fail.`,
      );
    }

    return page(200, 'Setup complete 🎉', [
      ...steps,
      'Landlord login: admin@stspm.com / admin1234',
      'Tenant login: maria.gonzalez@example.com / tenant1234',
      'Go to /login to sign in.',
    ]);
  } catch (err) {
    console.error('[setup] failed', err);
    return page(500, 'Setup failed', [
      ...steps,
      err instanceof Error ? err.message : String(err),
      'Check the deployment Runtime Logs for details. Re-running this URL is safe.',
    ]);
  }
}

/** Split the generated migration DDL into individual statements. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\r?\n/)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

function page(status: number, title: string, lines: string[]): NextResponse {
  const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#111}
h1{font-size:1.4rem}li{margin:.5rem 0}a{color:#1b5ef5}</style></head>
<body><h1>${escapeHtml(title)}</h1><ul>${items}</ul>
<p><a href="/login">Go to sign-in →</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
