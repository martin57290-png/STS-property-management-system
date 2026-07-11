import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorage, verifyFileToken } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Serves privately-stored files (local storage driver) via HMAC-signed,
 * expiring URLs produced by LocalStorageService.getSignedUrl().
 */
export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  const key = params.key.map(decodeURIComponent).join('/');
  const expires = Number(req.nextUrl.searchParams.get('expires'));
  const token = req.nextUrl.searchParams.get('token') ?? '';

  if (!expires || !token || !verifyFileToken(key, expires, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
  }

  try {
    const bytes = await getStorage().get(key);
    const doc = await prisma.document.findUnique({ where: { storageKey: key } });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': doc?.contentType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${(doc?.filename ?? 'file').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
