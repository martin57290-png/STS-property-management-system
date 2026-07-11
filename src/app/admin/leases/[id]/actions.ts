'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { notifyTenancyTenants } from '@/lib/notifications';
import { generateLeasePdf } from '@/lib/modules/leases/generate';

function backToLease(leaseId: string, params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`/admin/leases/${leaseId}?${qs.toString()}`);
}

/** Merge the template + terms into a print-ready PDF for wet signature. */
export async function generateLeasePdfAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const leaseId = String(formData.get('leaseId') ?? '');
  let error: string | null = null;
  try {
    await generateLeasePdf(leaseId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to generate the lease PDF.';
  }
  revalidatePath(`/admin/leases/${leaseId}`);
  revalidatePath('/admin/leases');
  if (error) backToLease(leaseId, { error });
  backToLease(leaseId, { notice: 'Lease PDF generated. Print it for wet signature.' });
}

/** Attach the wet-signed lease scan and mark the lease EXECUTED. */
export async function uploadExecutedLeaseAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const leaseId = String(formData.get('leaseId') ?? '');
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) backToLease(leaseId, { error: 'Lease not found.' });

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    backToLease(leaseId, { error: 'Choose the signed lease file (PDF or photo) to upload.' });
  }

  let error: string | null = null;
  try {
    const doc = await saveUpload({
      file,
      kind: 'document',
      category: 'EXECUTED_LEASE',
      keyPrefix: `leases/${lease.id}/executed`,
      uploadedById: user.id,
      owner: { leaseId: lease.id, tenancyId: lease.tenancyId },
    });
    await prisma.lease.update({
      where: { id: lease.id },
      data: {
        executedPdfKey: doc.storageKey,
        executedAt: new Date(),
        // Do not downgrade an already-active lease when replacing the scan.
        ...(lease.status === 'ACTIVE' ? {} : { status: 'EXECUTED' as const }),
      },
    });
    await audit({
      actorId: user.id,
      action: 'lease.executed_uploaded',
      entityType: 'Lease',
      entityId: lease.id,
      meta: { storageKey: doc.storageKey, filename: doc.filename },
    });
  } catch (err) {
    error =
      err instanceof UploadValidationError
        ? err.message
        : 'Failed to store the executed lease. Try again.';
  }

  revalidatePath(`/admin/leases/${leaseId}`);
  revalidatePath('/admin/leases');
  if (error) backToLease(leaseId, { error });
  backToLease(leaseId, {
    notice: 'Executed lease uploaded. Activate the tenancy when the tenants move in.',
  });
}

/** Activate the lease + tenancy; a renewal also expires the lease it replaces. */
export async function activateLeaseAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const leaseId = String(formData.get('leaseId') ?? '');
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { tenancy: { include: { unit: { include: { property: true } } } } },
  });
  if (!lease) backToLease(leaseId, { error: 'Lease not found.' });
  if (lease.status !== 'EXECUTED') {
    backToLease(leaseId, {
      error: 'Upload the wet-signed (executed) lease before activating the tenancy.',
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.lease.update({ where: { id: lease.id }, data: { status: 'ACTIVE' } });
    await tx.tenancy.update({
      where: { id: lease.tenancyId },
      data: {
        status: 'ACTIVE',
        // A renewal carries the tenancy forward onto the new terms.
        ...(lease.isRenewal
          ? {
              startDate: lease.startDate,
              endDate: lease.endDate,
              rentCents: lease.rentCents,
              depositCents: lease.depositCents,
            }
          : {}),
      },
    });
    if (lease.isRenewal && lease.renewedFromId) {
      await tx.lease.update({ where: { id: lease.renewedFromId }, data: { status: 'EXPIRED' } });
    }
  });

  await audit({
    actorId: user.id,
    action: 'lease.activated',
    entityType: 'Lease',
    entityId: lease.id,
    meta: { tenancyId: lease.tenancyId, isRenewal: lease.isRenewal },
  });
  await audit({
    actorId: user.id,
    action: 'tenancy.activated',
    entityType: 'Tenancy',
    entityId: lease.tenancyId,
    meta: { leaseId: lease.id },
  });
  if (lease.isRenewal && lease.renewedFromId) {
    await audit({
      actorId: user.id,
      action: 'lease.expired',
      entityType: 'Lease',
      entityId: lease.renewedFromId,
      meta: { replacedByLeaseId: lease.id },
    });
  }

  const { unit } = lease.tenancy;
  await notifyTenancyTenants(lease.tenancyId, {
    event: 'GENERAL',
    subject: lease.isRenewal ? 'Your lease renewal is active' : 'Your lease is active',
    body: `Your ${lease.isRenewal ? 'renewed ' : ''}lease for ${unit.property.street}, Unit ${unit.unitNumber} is now active: ${fmt(lease.startDate)} through ${fmt(lease.endDate)} at ${formatCents(lease.rentCents)}/month. Sign in to the resident portal for your documents and rent payments.`,
    smsBody: `STS: your lease for Unit ${unit.unitNumber} is active (${fmt(lease.startDate)}–${fmt(lease.endDate)}).`,
  });

  revalidatePath(`/admin/leases/${leaseId}`);
  revalidatePath('/admin/leases');
  backToLease(leaseId, { notice: 'Lease and tenancy are now active.' });
}

/** Landlord sets an initial resident-portal password for a tenant on this lease. */
export async function setTenantPasswordAction(formData: FormData): Promise<void> {
  const landlord = await requireLandlord();
  const leaseId = String(formData.get('leaseId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');

  if (password.length < 8) {
    backToLease(leaseId, { error: 'Portal passwords must be at least 8 characters.' });
  }

  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) backToLease(leaseId, { error: 'Lease not found.' });
  const membership = await prisma.tenancyTenant.findUnique({
    where: { tenancyId_userId: { tenancyId: lease.tenancyId, userId } },
    include: { user: true },
  });
  if (!membership) {
    backToLease(leaseId, { error: 'That user is not a tenant on this lease.' });
  }

  const passwordHash = await hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, isActive: true } });
  await audit({
    actorId: landlord.id,
    action: 'user.portal_password_set',
    entityType: 'User',
    entityId: userId,
    meta: { leaseId, tenancyId: lease.tenancyId },
  });

  revalidatePath(`/admin/leases/${leaseId}`);
  backToLease(leaseId, {
    notice: `Portal password set for ${membership.user.name}. They can sign in at /login with their email.`,
  });
}
