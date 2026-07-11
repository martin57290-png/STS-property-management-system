import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  computeAllBalances,
  runAutopay,
  sendRentReminder,
} from '@/lib/modules/payments/service';
import { daysUntil, nextRentDueDate } from '@/lib/modules/payments/helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/run-autopay — called daily by an external scheduler.
 *
 * 1. Runs autopay for active enrollments whose dayOfMonth is today (LA time)
 *    on ACTIVE tenancies with a balance owed.
 * 2. Sends RENT_DUE_REMINDER (email + SMS) to ACTIVE tenancies with a
 *    balance > 0 whose next rent due day is within
 *    getSettings().rentReminderDaysBefore days. To avoid re-nagging on every
 *    daily run inside the window, a tenancy is skipped when any of its
 *    tenants already got a RENT_DUE_REMINDER within the window.
 *
 * Authenticated via the x-cron-secret header when CRON_SECRET is set; open
 * in dev when unset. Returns JSON counts.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const autopay = await runAutopay({ onlyDueTodayLA: true });

    const settings = await getSettings();
    const daysBefore = settings.rentReminderDaysBefore;
    const balances = await computeAllBalances();
    const tenancies = await prisma.tenancy.findMany({
      where: { status: 'ACTIVE' },
      include: { tenants: { select: { userId: true } } },
    });

    let remindersSent = 0;
    const windowStart = new Date(Date.now() - daysBefore * 86_400_000);
    for (const tenancy of tenancies) {
      if ((balances.get(tenancy.id) ?? 0) <= 0) continue;
      const due = nextRentDueDate(tenancy.rentDueDay);
      const days = daysUntil(due);
      if (days < 0 || days > daysBefore) continue;

      const alreadyReminded = await prisma.notification.findFirst({
        where: {
          event: 'RENT_DUE_REMINDER',
          userId: { in: tenancy.tenants.map((t) => t.userId) },
          createdAt: { gte: windowStart },
        },
        select: { id: true },
      });
      if (alreadyReminded) continue;

      const ok = await sendRentReminder(tenancy.id);
      if (ok) remindersSent += 1;
    }

    return NextResponse.json({
      ok: true,
      autopayInitiated: autopay.initiated,
      autopaySkipped: autopay.skipped,
      remindersSent,
    });
  } catch (err) {
    console.error('[cron] run-autopay failed', err);
    return NextResponse.json({ ok: false, error: 'run-autopay failed' }, { status: 500 });
  }
}
