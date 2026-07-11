import { NextRequest, NextResponse } from 'next/server';
import { postMonthlyRentCharges } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/post-rent — called by an external scheduler (e.g. monthly on
 * the 1st) to post this month's rent charge for every ACTIVE tenancy.
 * Idempotent: tenancies that already have this month's rent charge are
 * skipped. Authenticated via the x-cron-secret header when CRON_SECRET is
 * set; open in dev when unset.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const posted = await postMonthlyRentCharges();
    return NextResponse.json({ ok: true, posted });
  } catch (err) {
    console.error('[cron] post-rent failed', err);
    return NextResponse.json({ ok: false, error: 'post-rent failed' }, { status: 500 });
  }
}
