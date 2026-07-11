'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { audit } from '@/lib/audit';

function backToAutopay(params: { notice?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.notice) qs.set('notice', params.notice);
  if (params.error) qs.set('error', params.error);
  redirect(`/tenant/payments/autopay?${qs.toString()}`);
}

function revalidateAutopay(): void {
  revalidatePath('/tenant/payments/autopay');
  revalidatePath('/tenant/payments');
  revalidatePath('/admin/payments');
}

/** Enroll in autopay or update an existing enrollment (day + method). */
export async function upsertAutopayAction(formData: FormData): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) {
    backToAutopay({ error: 'No tenancy is linked to your account.' });
  }

  const dayOfMonth = Number(formData.get('dayOfMonth'));
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    backToAutopay({ error: 'Pick a day of the month between 1 and 28.' });
  }

  const methodRaw = String(formData.get('method') ?? '');
  const method: PaymentMethod | null =
    methodRaw === 'ACH' ? 'ACH' : methodRaw === 'CARD' ? 'CARD' : null;
  if (!method) {
    backToAutopay({ error: 'Choose a payment method.' });
  }

  const existing = await prisma.autopayEnrollment.findUnique({
    where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
  });

  const enrollment = await prisma.autopayEnrollment.upsert({
    where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
    create: { tenancyId: tenancy.id, userId: user.id, dayOfMonth, method, active: true },
    update: { dayOfMonth, method, active: true },
  });

  await audit({
    actorId: user.id,
    action: existing ? 'autopay.updated' : 'autopay.enrolled',
    entityType: 'AutopayEnrollment',
    entityId: enrollment.id,
    meta: { tenancyId: tenancy.id, dayOfMonth, method },
  });

  revalidateAutopay();
  backToAutopay({
    notice: existing
      ? `Autopay updated — it will run on day ${dayOfMonth} of each month.`
      : `Autopay is on — it will run on day ${dayOfMonth} of each month for your full balance.`,
  });
}

/** Pause or resume the enrollment. */
export async function toggleAutopayAction(): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) {
    backToAutopay({ error: 'No tenancy is linked to your account.' });
  }

  const enrollment = await prisma.autopayEnrollment.findUnique({
    where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
  });
  if (!enrollment) {
    backToAutopay({ error: 'You are not enrolled in autopay.' });
  }

  const updated = await prisma.autopayEnrollment.update({
    where: { id: enrollment.id },
    data: { active: !enrollment.active },
  });

  await audit({
    actorId: user.id,
    action: updated.active ? 'autopay.resumed' : 'autopay.paused',
    entityType: 'AutopayEnrollment',
    entityId: enrollment.id,
    meta: { tenancyId: tenancy.id },
  });

  revalidateAutopay();
  backToAutopay({ notice: updated.active ? 'Autopay resumed.' : 'Autopay paused.' });
}

/** Cancel (delete) the enrollment entirely. */
export async function cancelAutopayAction(): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) {
    backToAutopay({ error: 'No tenancy is linked to your account.' });
  }

  const enrollment = await prisma.autopayEnrollment.findUnique({
    where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
  });
  if (!enrollment) {
    backToAutopay({ error: 'You are not enrolled in autopay.' });
  }

  await prisma.autopayEnrollment.delete({ where: { id: enrollment.id } });

  await audit({
    actorId: user.id,
    action: 'autopay.cancelled',
    entityType: 'AutopayEnrollment',
    entityId: enrollment.id,
    meta: { tenancyId: tenancy.id },
  });

  revalidateAutopay();
  backToAutopay({ notice: 'Autopay cancelled. You can re-enroll any time.' });
}
