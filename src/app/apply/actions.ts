'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { FIRST_STEP, stepPath } from '@/lib/modules/applications/steps';

function backToStart(unitId: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  if (unitId) params.set('unit', unitId);
  redirect(`/apply?${params.toString()}`);
}

/** Create a DRAFT application and enter the step wizard. Public — no login. */
export async function startApplication(formData: FormData): Promise<void> {
  const unitId = String(formData.get('unitId') ?? '').trim();
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!unitId) backToStart(unitId, 'Please choose the unit you are applying for.');
  if (!firstName || !lastName) backToStart(unitId, 'Please enter your first and last name.');
  if (!email || !email.includes('@')) backToStart(unitId, 'Please enter a valid email address.');
  if (!phone) backToStart(unitId, 'Please enter a phone number.');

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit || !unit.isListed) {
    backToStart('', 'That unit is no longer accepting applications. Please choose another.');
  }

  const app = await prisma.application.create({
    data: { unitId, firstName, lastName, email, phone, status: 'DRAFT' },
  });

  await audit({
    action: 'application.started',
    entityType: 'Application',
    entityId: app.id,
    meta: { unitId, email },
  });

  redirect(stepPath(app.trackingToken, FIRST_STEP));
}
