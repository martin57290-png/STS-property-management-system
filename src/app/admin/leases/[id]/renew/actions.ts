'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { laDateToUtc } from '@/lib/dates';
import {
  deriveDisclosures,
  disclosuresFromForm,
  parseLeaseTerms,
  type LeaseFormState,
} from '@/lib/modules/leases/helpers';

/**
 * Create a renewal lease (DRAFT) for the same tenancy. The old lease keeps
 * running; activating the renewal expires it and rolls the tenancy forward.
 */
export async function createRenewalAction(
  _prev: LeaseFormState,
  formData: FormData,
): Promise<LeaseFormState> {
  const user = await requireLandlord();
  const renewOfId = String(formData.get('renewOfId') ?? '').trim();

  const oldLease = await prisma.lease.findUnique({
    where: { id: renewOfId },
    include: {
      tenancy: { include: { unit: { include: { property: true } } } },
      renewedTo: { select: { id: true } },
    },
  });
  if (!oldLease) return { error: 'The lease being renewed was not found.' };
  if (oldLease.renewedTo) {
    redirect(`/admin/leases/${oldLease.renewedTo.id}`);
  }

  const parsed = parseLeaseTerms(formData);
  if ('error' in parsed) return { error: parsed.error };
  const { terms } = parsed;

  const template = await prisma.leaseTemplate.findUnique({ where: { id: terms.templateId } });
  if (!template) return { error: 'The selected lease template no longer exists.' };

  const items = deriveDisclosures(oldLease.tenancy.unit.property);
  const { record, missingLabels } = disclosuresFromForm(formData, items);
  if (missingLabels.length > 0) {
    return {
      error: `Confirm the required disclosures before creating the renewal: ${missingLabels.join('; ')}.`,
    };
  }

  const renewal = await prisma.lease.create({
    data: {
      tenancyId: oldLease.tenancyId,
      templateId: template.id,
      status: 'DRAFT',
      isRenewal: true,
      renewedFromId: oldLease.id,
      startDate: laDateToUtc(terms.startYmd),
      endDate: laDateToUtc(terms.endYmd),
      rentCents: terms.rentCents,
      depositCents: terms.depositCents,
      lateFeeCents: terms.lateFeeCents,
      lateFeeGraceDays: terms.lateFeeGraceDays,
      utilitiesIncluded: terms.utilities as Prisma.InputJsonValue,
      petTerms: terms.petTerms,
      petRentCents: terms.petRentCents,
      additionalTerms: terms.additionalTerms,
      disclosures: record as unknown as Prisma.InputJsonValue,
    },
  });

  await audit({
    actorId: user.id,
    action: 'lease.renewal_created',
    entityType: 'Lease',
    entityId: renewal.id,
    meta: {
      renewedFromId: oldLease.id,
      tenancyId: oldLease.tenancyId,
      oldRentCents: oldLease.rentCents,
      newRentCents: terms.rentCents,
    },
  });

  revalidatePath('/admin/leases');
  revalidatePath(`/admin/leases/${oldLease.id}`);
  redirect(`/admin/leases/${renewal.id}`);
}
