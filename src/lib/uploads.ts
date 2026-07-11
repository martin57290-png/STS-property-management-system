import { prisma } from '@/lib/db';
import { buildStorageKey, getStorage } from '@/lib/storage';
import type { DocumentCategory } from '@prisma/client';

/** Validation rules per broad upload kind. */
const RULES = {
  image: {
    maxBytes: 15 * 1024 * 1024,
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },
  video: {
    maxBytes: 100 * 1024 * 1024,
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
  document: {
    maxBytes: 20 * 1024 * 1024,
    types: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ],
  },
  media: {
    // images or video (work orders)
    maxBytes: 100 * 1024 * 1024,
    types: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ],
  },
} as const;

export type UploadKind = keyof typeof RULES;

export class UploadValidationError extends Error {}

export function validateUpload(file: { size: number; type: string }, kind: UploadKind): void {
  const rule = RULES[kind];
  if (file.size <= 0) throw new UploadValidationError('File is empty.');
  if (file.size > rule.maxBytes) {
    throw new UploadValidationError(
      `File is too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).`,
    );
  }
  if (!(rule.types as readonly string[]).includes(file.type)) {
    throw new UploadValidationError(`File type ${file.type || 'unknown'} is not allowed.`);
  }
}

/**
 * Validate, store privately, and record a Document row for an uploaded File.
 * `owner` links the document to its parent record(s).
 */
export async function saveUpload(params: {
  file: File;
  kind: UploadKind;
  category: DocumentCategory;
  keyPrefix: string; // e.g. `applications/${id}`
  uploadedById?: string | null;
  owner?: {
    applicationId?: string;
    tenancyId?: string;
    leaseId?: string;
    unitId?: string;
    propertyId?: string;
    workOrderId?: string;
    inspectionItemId?: string;
  };
}) {
  const { file, kind, category, keyPrefix, uploadedById, owner } = params;
  validateUpload({ size: file.size, type: file.type }, kind);

  const key = buildStorageKey(keyPrefix, file.name || 'upload');
  const bytes = Buffer.from(await file.arrayBuffer());
  await getStorage().put(key, bytes, file.type);

  return prisma.document.create({
    data: {
      storageKey: key,
      filename: file.name || 'upload',
      contentType: file.type,
      sizeBytes: file.size,
      category,
      uploadedById: uploadedById ?? null,
      ...owner,
    },
  });
}
