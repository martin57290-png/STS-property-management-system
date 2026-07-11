'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ItemCondition } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyTenancyTenants } from '@/lib/notifications';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import {
  appBaseUrl,
  CONDITIONS,
  shortUnitLabel,
  TYPE_LABELS,
} from '@/lib/modules/inspections/helpers';
import { completeIfFullyAcknowledged } from '@/lib/modules/inspections/service';

function detailPath(id: string): string {
  return `/admin/inspections/${id}`;
}

function refresh(id: string): void {
  revalidatePath('/admin/inspections');
  revalidatePath(detailPath(id));
  revalidatePath('/tenant/inspections');
  revalidatePath(`/tenant/inspections/${id}`);
}

function failUrl(id: string, message: string): string {
  return `${detailPath(id)}?error=${encodeURIComponent(message)}`;
}

function noticeUrl(id: string, message: string): string {
  return `${detailPath(id)}?notice=${encodeURIComponent(message)}`;
}

/** SCHEDULED → IN_PROGRESS */
export async function startInspection(id: string): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status !== 'SCHEDULED') {
    redirect(failUrl(id, 'Only a scheduled inspection can be started.'));
  }

  await prisma.inspection.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  await audit({
    actorId: user.id,
    action: 'inspection.started',
    entityType: 'Inspection',
    entityId: id,
    meta: { tenancyId: inspection.tenancyId, type: inspection.type },
  });
  refresh(id);
  redirect(noticeUrl(id, 'Inspection started — work through the checklist room by room.'));
}

/** IN_PROGRESS → PENDING_SIGNATURES, then ask the tenant to review. */
export async function markReadyForSignatures(id: string): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: { tenancy: { include: { unit: { include: { property: true } } } } },
  });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status !== 'IN_PROGRESS') {
    redirect(failUrl(id, 'Start the inspection before marking it ready for signatures.'));
  }

  await prisma.inspection.update({ where: { id }, data: { status: 'PENDING_SIGNATURES' } });
  await audit({
    actorId: user.id,
    action: 'inspection.ready_for_signatures',
    entityType: 'Inspection',
    entityId: id,
    meta: { tenancyId: inspection.tenancyId, type: inspection.type },
  });

  const unitLabel = shortUnitLabel(inspection.tenancy.unit);
  await notifyTenancyTenants(inspection.tenancyId, {
    event: 'GENERAL',
    subject: `${TYPE_LABELS[inspection.type]} inspection report ready for your review — ${unitLabel}`,
    body:
      `The ${TYPE_LABELS[inspection.type].toLowerCase()} inspection report for ${unitLabel} is ready ` +
      `for your review and acknowledgement. Please sign in to your resident portal to review it:\n\n` +
      `${appBaseUrl()}/tenant/inspections/${id}\n\n— STS Property Management`,
    smsBody: `STS: your ${TYPE_LABELS[inspection.type].toLowerCase()} inspection report is ready to review and sign in the resident portal.`,
  });

  refresh(id);
  redirect(noticeUrl(id, 'Marked ready for signatures — the tenant has been asked to review.'));
}

/** PENDING_SIGNATURES → IN_PROGRESS (only while nobody has signed yet). */
export async function reopenInspection(id: string): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status !== 'PENDING_SIGNATURES' || inspection.tenantAckAt || inspection.landlordAckAt) {
    redirect(failUrl(id, 'Only an unsigned report that is pending signatures can be reopened.'));
  }

  await prisma.inspection.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  await audit({
    actorId: user.id,
    action: 'inspection.reopened',
    entityType: 'Inspection',
    entityId: id,
    meta: { tenancyId: inspection.tenancyId },
  });
  refresh(id);
  redirect(noticeUrl(id, 'Inspection reopened for edits.'));
}

/** Save general inspection notes. */
export async function updateNotes(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status === 'COMPLETED') {
    redirect(failUrl(id, 'A completed inspection can no longer be edited.'));
  }

  const notes = String(formData.get('notes') ?? '').trim() || null;
  await prisma.inspection.update({ where: { id }, data: { notes } });
  await audit({
    actorId: user.id,
    action: 'inspection.notes_updated',
    entityType: 'Inspection',
    entityId: id,
  });
  refresh(id);
  redirect(noticeUrl(id, 'Notes saved.'));
}

/**
 * Save all checklist items in one room: condition + notes per item, plus any
 * newly attached photos (multiple per item).
 */
export async function saveRoom(id: string, room: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status === 'COMPLETED') {
    redirect(failUrl(id, 'A completed inspection can no longer be edited.'));
  }

  const items = await prisma.inspectionItem.findMany({ where: { inspectionId: id, room } });
  if (items.length === 0) redirect(failUrl(id, `No checklist items found for "${room}".`));

  let updated = 0;
  let photosAdded = 0;
  let uploadError: string | null = null;

  for (const item of items) {
    const conditionRaw = String(formData.get(`condition-${item.id}`) ?? '');
    const condition: ItemCondition | null = CONDITIONS.find((c) => c === conditionRaw) ?? null;
    const notes = String(formData.get(`notes-${item.id}`) ?? '').trim() || null;

    await prisma.inspectionItem.update({
      where: { id: item.id },
      data: { condition, notes },
    });
    updated += 1;

    const files = formData
      .getAll(`photos-${item.id}`)
      .filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      try {
        await saveUpload({
          file,
          kind: 'image',
          category: 'INSPECTION_PHOTO',
          keyPrefix: `inspections/${id}`,
          uploadedById: user.id,
          owner: { inspectionItemId: item.id },
        });
        photosAdded += 1;
      } catch (err) {
        if (err instanceof UploadValidationError) {
          uploadError = `${item.item}: ${err.message}`;
        } else {
          throw err;
        }
      }
    }
  }

  await audit({
    actorId: user.id,
    action: 'inspection.items_updated',
    entityType: 'Inspection',
    entityId: id,
    meta: { room, updated, photosAdded },
  });

  refresh(id);
  if (uploadError) {
    redirect(failUrl(id, `Saved "${room}", but a photo was rejected — ${uploadError}`));
  }
  redirect(
    noticeUrl(
      id,
      photosAdded > 0 ? `Saved "${room}" (${photosAdded} photo(s) added).` : `Saved "${room}".`,
    ),
  );
}

/** Add a custom checklist line item. */
export async function addItem(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status === 'COMPLETED') {
    redirect(failUrl(id, 'A completed inspection can no longer be edited.'));
  }

  const room = String(formData.get('room') ?? '').trim();
  const item = String(formData.get('item') ?? '').trim();
  if (!room || !item) {
    redirect(failUrl(id, 'A custom line item needs both a room and an item name.'));
  }

  const max = await prisma.inspectionItem.aggregate({
    where: { inspectionId: id },
    _max: { sortOrder: true },
  });
  const created = await prisma.inspectionItem.create({
    data: { inspectionId: id, room, item, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await audit({
    actorId: user.id,
    action: 'inspection.item_added',
    entityType: 'Inspection',
    entityId: id,
    meta: { itemId: created.id, room, item },
  });
  refresh(id);
  redirect(noticeUrl(id, `Added "${item}" under ${room}.`));
}

/** Landlord signs the report; completes the inspection when both parties have. */
export async function landlordAcknowledge(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const inspection = await prisma.inspection.findUnique({ where: { id } });
  if (!inspection) redirect(failUrl(id, 'Inspection not found.'));
  if (inspection.status !== 'PENDING_SIGNATURES') {
    redirect(failUrl(id, 'The report must be pending signatures before it can be signed.'));
  }
  if (inspection.landlordAckAt) {
    redirect(failUrl(id, 'You have already signed this inspection report.'));
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect(failUrl(id, 'Type your full name to sign the report.'));
  }

  await prisma.inspection.update({
    where: { id },
    data: { landlordAckAt: new Date(), landlordAckName: name },
  });
  await audit({
    actorId: user.id,
    action: 'inspection.landlord_acknowledged',
    entityType: 'Inspection',
    entityId: id,
    meta: { name, tenancyId: inspection.tenancyId },
  });

  const completed = await completeIfFullyAcknowledged(id, user.id);

  refresh(id);
  redirect(
    noticeUrl(
      id,
      completed
        ? 'Signed — both parties have acknowledged, so the inspection is now completed.'
        : 'Signed — waiting on the tenant acknowledgement.',
    ),
  );
}
