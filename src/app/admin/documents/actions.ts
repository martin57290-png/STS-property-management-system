'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { DocumentCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { getStorage } from '@/lib/storage';
import { VAULT_UPLOAD_CATEGORIES } from '@/lib/modules/dashboard/helpers';

function backToVault(params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`/admin/documents?${qs.toString()}`);
}

/** Upload a document into the vault, attached to a tenancy or a unit. */
export async function uploadVaultDocumentAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();

  const target = String(formData.get('target') ?? '');
  const [targetType, targetId] = target.split(':');
  if ((targetType !== 'tenancy' && targetType !== 'unit') || !targetId) {
    backToVault({ error: 'Choose the tenancy or unit this document belongs to.' });
  }

  const categoryRaw = String(formData.get('category') ?? '');
  const category = VAULT_UPLOAD_CATEGORIES.find((c) => c === categoryRaw);
  if (!category) backToVault({ error: 'Choose a document category.' });

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    backToVault({ error: 'Choose a file to upload (PDF or image).' });
  }

  let owner: { tenancyId?: string; unitId?: string };
  let keyPrefix: string;
  if (targetType === 'tenancy') {
    const tenancy = await prisma.tenancy.findUnique({ where: { id: targetId } });
    if (!tenancy) backToVault({ error: 'Tenancy not found.' });
    owner = { tenancyId: targetId };
    keyPrefix = `tenancies/${targetId}`;
  } else {
    const unit = await prisma.unit.findUnique({ where: { id: targetId } });
    if (!unit) backToVault({ error: 'Unit not found.' });
    owner = { unitId: targetId };
    keyPrefix = `units/${targetId}`;
  }

  let error: string | null = null;
  let docId: string | null = null;
  let filename = '';
  try {
    const doc = await saveUpload({
      file,
      kind: 'document',
      category: category as DocumentCategory,
      keyPrefix,
      uploadedById: user.id,
      owner,
    });
    docId = doc.id;
    filename = doc.filename;
  } catch (err) {
    error =
      err instanceof UploadValidationError
        ? err.message
        : 'Failed to store the document. Please try again.';
  }
  if (error || !docId) backToVault({ error: error ?? 'Upload failed.' });

  await audit({
    actorId: user.id,
    action: 'document.uploaded',
    entityType: 'Document',
    entityId: docId,
    meta: { category, target, filename },
  });
  revalidatePath('/admin/documents');
  backToVault({ notice: `Uploaded ${filename}.` });
}

/** Delete a document row and its stored file. */
export async function deleteVaultDocumentAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const documentId = String(formData.get('documentId') ?? '');

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) backToVault({ error: 'Document not found.' });

  try {
    await getStorage().delete(doc.storageKey);
  } catch {
    // A missing stored file should not block removing the record.
  }
  await prisma.document.delete({ where: { id: doc.id } });
  await audit({
    actorId: user.id,
    action: 'document.deleted',
    entityType: 'Document',
    entityId: doc.id,
    meta: { filename: doc.filename, category: doc.category, storageKey: doc.storageKey },
  });
  revalidatePath('/admin/documents');
  backToVault({ notice: `Deleted ${doc.filename}.` });
}
