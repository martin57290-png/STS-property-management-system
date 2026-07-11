import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { generateLeasePdf } from '@/lib/modules/leases/generate';

export const dynamic = 'force-dynamic';

/**
 * Streams the generated (merge-rendered, print-ready) lease PDF.
 * Landlord-only; regenerates on the fly if the PDF is missing.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (user.role !== 'LANDLORD') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    select: { id: true, generatedPdfKey: true },
  });
  if (!lease) {
    return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
  }

  try {
    let key = lease.generatedPdfKey;
    if (!key) {
      key = (await generateLeasePdf(lease.id, user.id)).storageKey;
    }
    let bytes: Buffer;
    try {
      bytes = await getStorage().get(key);
    } catch {
      // Stored file vanished (e.g. cleared local storage) — regenerate once.
      key = (await generateLeasePdf(lease.id, user.id)).storageKey;
      bytes = await getStorage().get(key);
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="lease-${lease.id}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to produce the lease PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
