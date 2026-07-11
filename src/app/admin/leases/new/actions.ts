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
  type ParsedLeaseTerms,
  type StoredDisclosures,
} from '@/lib/modules/leases/helpers';

/** Find-or-create a tenant portal user (no password yet — set from lease detail). */
async function ensureTenantUser(
  tx: Prisma.TransactionClient,
  params: { email: string; name: string; phone: string | null },
) {
  const email = params.email.toLowerCase().trim();
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === 'APPLICANT') {
      return tx.user.update({
        where: { id: existing.id },
        data: { role: 'TENANT', phone: existing.phone ?? params.phone },
      });
    }
    return existing;
  }
  return tx.user.create({
    data: {
      email,
      name: params.name,
      phone: params.phone,
      role: 'TENANT',
      passwordHash: null, // landlord sets the initial portal password from the lease page
    },
  });
}

function leaseTermsData(terms: ParsedLeaseTerms, disclosures: StoredDisclosures) {
  return {
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
    disclosures: disclosures as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Create a lease from an approved application (creating tenant users + the
 * tenancy) or for an existing tenancy. Used with useFormState so validation
 * errors keep the form filled.
 */
export async function createLeaseAction(
  _prev: LeaseFormState,
  formData: FormData,
): Promise<LeaseFormState> {
  const user = await requireLandlord();
  const applicationId = String(formData.get('applicationId') ?? '').trim();
  const tenancyId = String(formData.get('tenancyId') ?? '').trim();

  const parsed = parseLeaseTerms(formData);
  if ('error' in parsed) return { error: parsed.error };
  const { terms } = parsed;

  const template = await prisma.leaseTemplate.findUnique({ where: { id: terms.templateId } });
  if (!template) return { error: 'The selected lease template no longer exists.' };

  let leaseId: string;

  if (applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { unit: { include: { property: true } }, coApplicants: true, lease: true },
    });
    if (!application) return { error: 'Application not found.' };
    if (application.lease) {
      redirect(`/admin/leases/${application.lease.id}`);
    }

    const items = deriveDisclosures(application.unit.property);
    const { record, missingLabels } = disclosuresFromForm(formData, items);
    if (missingLabels.length > 0) {
      return { error: `Confirm the required disclosures before creating the lease: ${missingLabels.join('; ')}.` };
    }

    leaseId = await prisma.$transaction(async (tx) => {
      const primary = await ensureTenantUser(tx, {
        email: application.email,
        name: `${application.firstName} ${application.lastName}`,
        phone: application.phone,
      });

      const coUserIds: string[] = [];
      for (const co of application.coApplicants) {
        if (!co.email || co.isOccupantOnly) continue;
        const coUser = await ensureTenantUser(tx, {
          email: co.email,
          name: `${co.firstName} ${co.lastName}`,
          phone: co.phone,
        });
        if (coUser.id !== primary.id && !coUserIds.includes(coUser.id)) {
          coUserIds.push(coUser.id);
        }
      }

      const tenancy = await tx.tenancy.create({
        data: {
          unitId: application.unitId,
          status: 'PENDING',
          startDate: laDateToUtc(terms.startYmd),
          endDate: laDateToUtc(terms.endYmd),
          rentCents: terms.rentCents,
          depositCents: terms.depositCents,
          rentDueDay: 1,
        },
      });
      await tx.tenancyTenant.create({
        data: { tenancyId: tenancy.id, userId: primary.id, isPrimary: true },
      });
      for (const userId of coUserIds) {
        await tx.tenancyTenant.create({
          data: { tenancyId: tenancy.id, userId, isPrimary: false },
        });
      }

      const lease = await tx.lease.create({
        data: {
          tenancyId: tenancy.id,
          templateId: template.id,
          applicationId: application.id,
          status: 'DRAFT',
          ...leaseTermsData(terms, record),
        },
      });
      return lease.id;
    });

    await audit({
      actorId: user.id,
      action: 'lease.created',
      entityType: 'Lease',
      entityId: leaseId,
      meta: {
        source: 'application',
        applicationId: application.id,
        unitId: application.unitId,
        rentCents: terms.rentCents,
        depositCents: terms.depositCents,
      },
    });
  } else if (tenancyId) {
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { unit: { include: { property: true } } },
    });
    if (!tenancy) return { error: 'Tenancy not found.' };

    const items = deriveDisclosures(tenancy.unit.property);
    const { record, missingLabels } = disclosuresFromForm(formData, items);
    if (missingLabels.length > 0) {
      return { error: `Confirm the required disclosures before creating the lease: ${missingLabels.join('; ')}.` };
    }

    const lease = await prisma.lease.create({
      data: {
        tenancyId: tenancy.id,
        templateId: template.id,
        status: 'DRAFT',
        ...leaseTermsData(terms, record),
      },
    });
    leaseId = lease.id;

    await audit({
      actorId: user.id,
      action: 'lease.created',
      entityType: 'Lease',
      entityId: leaseId,
      meta: {
        source: 'tenancy',
        tenancyId: tenancy.id,
        unitId: tenancy.unitId,
        rentCents: terms.rentCents,
        depositCents: terms.depositCents,
      },
    });
  } else {
    return { error: 'Start the wizard from an application or an existing tenancy.' };
  }

  revalidatePath('/admin/leases');
  redirect(`/admin/leases/${leaseId}`);
}
