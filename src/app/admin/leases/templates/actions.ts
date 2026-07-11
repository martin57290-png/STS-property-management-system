'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { DEFAULT_CA_LEASE_TEMPLATE } from '@/lib/modules/leases/default-template';

function readTemplateForm(formData: FormData): {
  name: string;
  body: string;
  isDefault: boolean;
} | null {
  const name = String(formData.get('name') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!name || !body) return null;
  return { name, body, isDefault: formData.get('isDefault') === 'on' };
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const parsed = readTemplateForm(formData);
  if (!parsed) {
    redirect(`/admin/leases/templates/new?error=${encodeURIComponent('Name and template body are required.')}`);
  }

  const template = await prisma.$transaction(async (tx) => {
    if (parsed.isDefault) {
      await tx.leaseTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.leaseTemplate.create({ data: parsed });
  });

  await audit({
    actorId: user.id,
    action: 'lease_template.created',
    entityType: 'LeaseTemplate',
    entityId: template.id,
    meta: { name: template.name, isDefault: template.isDefault },
  });
  revalidatePath('/admin/leases/templates');
  redirect('/admin/leases/templates');
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const id = String(formData.get('id') ?? '');
  const existing = await prisma.leaseTemplate.findUnique({ where: { id } });
  if (!existing) {
    redirect(`/admin/leases/templates?error=${encodeURIComponent('Template not found.')}`);
  }
  const parsed = readTemplateForm(formData);
  if (!parsed) {
    redirect(
      `/admin/leases/templates/${id}?error=${encodeURIComponent('Name and template body are required.')}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.isDefault) {
      await tx.leaseTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    await tx.leaseTemplate.update({ where: { id }, data: parsed });
  });

  await audit({
    actorId: user.id,
    action: 'lease_template.updated',
    entityType: 'LeaseTemplate',
    entityId: id,
    meta: { name: parsed.name, isDefault: parsed.isDefault },
  });
  revalidatePath('/admin/leases/templates');
  redirect('/admin/leases/templates');
}

/** Insert the built-in California lease template as a new template row. */
export async function restoreDefaultTemplateAction(): Promise<void> {
  const user = await requireLandlord();
  const existingDefault = await prisma.leaseTemplate.findFirst({ where: { isDefault: true } });
  const template = await prisma.leaseTemplate.create({
    data: {
      name: DEFAULT_CA_LEASE_TEMPLATE.name,
      body: DEFAULT_CA_LEASE_TEMPLATE.body,
      isDefault: !existingDefault,
    },
  });
  await audit({
    actorId: user.id,
    action: 'lease_template.default_restored',
    entityType: 'LeaseTemplate',
    entityId: template.id,
    meta: { name: template.name, isDefault: template.isDefault },
  });
  revalidatePath('/admin/leases/templates');
  redirect('/admin/leases/templates');
}
