import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { toDateInputValue } from '@/lib/dates';
import { getRentRoll, rentRollCsv } from '@/lib/modules/dashboard/reports';

export const dynamic = 'force-dynamic';

/** Rent roll CSV download. Landlord-only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (user.role !== 'LANDLORD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const csv = rentRollCsv(await getRentRoll());
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rent-roll-${toDateInputValue(new Date())}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
