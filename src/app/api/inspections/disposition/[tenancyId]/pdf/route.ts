import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Streams the finalized security-deposit disposition statement PDF.
 * Accessible to the landlord and to tenants on the tenancy.
 */
export async function GET(_req: Request, { params }: { params: { tenancyId: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  if (user.role !== 'LANDLORD') {
    const link = await prisma.tenancyTenant.findUnique({
      where: { tenancyId_userId: { tenancyId: params.tenancyId, userId: user.id } },
    });
    if (!link) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const disposition = await prisma.depositDisposition.findUnique({
    where: { tenancyId: params.tenancyId },
    select: { pdfKey: true, finalizedAt: true },
  });
  if (!disposition?.pdfKey || !disposition.finalizedAt) {
    return NextResponse.json(
      { error: 'The disposition statement has not been finalized yet.' },
      { status: 404 },
    );
  }

  try {
    const bytes = await getStorage().get(disposition.pdfKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="deposit-disposition-${params.tenancyId}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'The stored statement PDF could not be read.' },
      { status: 500 },
    );
  }
}
