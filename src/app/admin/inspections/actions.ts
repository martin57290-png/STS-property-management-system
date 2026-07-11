'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fmtDateTime } from '@/lib/dates';
import { notifyTenancyTenants } from '@/lib/notifications';
import { buildDefaultChecklist } from '@/lib/modules/inspections/checklist';
import {
  appBaseUrl,
  laDateTimeLocalToUtc,
  shortUnitLabel,
  TYPE_LABELS,
} from '@/lib/modules/inspections/helpers';

function failUrl(message: string): string {
  return `/admin/inspections?error=${encodeURIComponent(message)}`;
}

/**
 * Schedule a move-in or move-out inspection for a tenancy, auto-creating the
 * room-by-room checklist from the unit's bedroom/bathroom counts.
 */
export async function scheduleInspection(formData: FormData): Promise<void> {
  const user = await requireLandlord();

  const tenancyId = String(formData.get('tenancyId') ?? '').trim();
  const typeRaw = String(formData.get('type') ?? '');
  const type = (['MOVE_IN', 'MOVE_OUT'] as const).find((t) => t === typeRaw);
  if (!tenancyId || !type) {
    redirect(failUrl('Choose a tenancy and an inspection type.'));
  }

  const scheduledAt = laDateTimeLocalToUtc(String(formData.get('scheduledAt') ?? ''));
  if (!scheduledAt) {
    redirect(failUrl('Enter a valid date and time for the inspection.'));
  }

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { unit: { include: { property: true } } },
  });
  if (!tenancy) {
    redirect(failUrl('Tenancy not found.'));
  }

  const duplicateMessage =
    `A ${TYPE_LABELS[type].toLowerCase()} inspection already exists for ` +
    `${shortUnitLabel(tenancy.unit)} — each tenancy can have one move-in and one move-out inspection. ` +
    'Open the existing inspection from the list below.';

  const existing = await prisma.inspection.findUnique({
    where: { tenancyId_type: { tenancyId, type } },
    select: { id: true },
  });
  if (existing) {
    redirect(failUrl(duplicateMessage));
  }

  const checklist = buildDefaultChecklist(tenancy.unit.bedrooms, tenancy.unit.bathrooms);

  let inspectionId: string | null = null;
  try {
    const inspection = await prisma.inspection.create({
      data: {
        tenancyId,
        type,
        scheduledAt,
        items: { createMany: { data: checklist } },
      },
    });
    inspectionId = inspection.id;
  } catch (err) {
    // Race on the @@unique([tenancyId, type]) constraint.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err;
    }
  }
  if (!inspectionId) {
    redirect(failUrl(duplicateMessage));
  }

  await audit({
    actorId: user.id,
    action: 'inspection.scheduled',
    entityType: 'Inspection',
    entityId: inspectionId,
    meta: {
      tenancyId,
      type,
      scheduledAt: scheduledAt.toISOString(),
      itemCount: checklist.length,
    },
  });

  const unitLabel = shortUnitLabel(tenancy.unit);
  await notifyTenancyTenants(tenancyId, {
    event: 'INSPECTION_SCHEDULED',
    subject: `${TYPE_LABELS[type]} inspection scheduled — ${unitLabel}`,
    body:
      `Your ${TYPE_LABELS[type].toLowerCase()} inspection for ${unitLabel} has been scheduled ` +
      `for ${fmtDateTime(scheduledAt)}.\n\nYou can review the inspection report in your resident ` +
      `portal at ${appBaseUrl()}/tenant/inspections once it is completed.\n\n— STS Property Management`,
    smsBody: `STS: ${TYPE_LABELS[type]} inspection for ${unitLabel} scheduled for ${fmtDateTime(scheduledAt)}.`,
  });

  revalidatePath('/admin/inspections');
  redirect(`/admin/inspections/${inspectionId}`);
}
