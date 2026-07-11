'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';

function back(path: string, params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`${path}?${qs.toString()}`);
}

function parsePropertyFields(formData: FormData): {
  fields?: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    yearBuilt: number | null;
    notes: string | null;
  };
  error?: string;
} {
  const name = String(formData.get('name') ?? '').trim();
  const street = String(formData.get('street') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  const state = String(formData.get('state') ?? '').trim() || 'CA';
  const zip = String(formData.get('zip') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const yearBuiltRaw = String(formData.get('yearBuilt') ?? '').trim();

  if (!name || !street || !city || !zip) {
    return { error: 'Name, street, city, and ZIP are required.' };
  }
  let yearBuilt: number | null = null;
  if (yearBuiltRaw) {
    const n = Number(yearBuiltRaw);
    if (!Number.isInteger(n) || n < 1800 || n > 2100) {
      return { error: 'Year built must be a four-digit year.' };
    }
    yearBuilt = n;
  }
  return { fields: { name, street, city, state, zip, yearBuilt, notes } };
}

export async function createPropertyAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const { fields, error } = parsePropertyFields(formData);
  if (!fields) back('/admin/properties/new', { error });

  const property = await prisma.property.create({ data: fields });
  await audit({
    actorId: user.id,
    action: 'property.created',
    entityType: 'Property',
    entityId: property.id,
    meta: { name: property.name },
  });
  revalidatePath('/admin/properties');
  back(`/admin/properties/${property.id}`, { notice: 'Property created. Now add its units.' });
}

export async function updatePropertyAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const id = String(formData.get('propertyId') ?? '');
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing) back('/admin/properties', { error: 'Property not found.' });

  const { fields, error } = parsePropertyFields(formData);
  if (!fields) back(`/admin/properties/${id}/edit`, { error });

  await prisma.property.update({ where: { id }, data: fields });
  await audit({
    actorId: user.id,
    action: 'property.updated',
    entityType: 'Property',
    entityId: id,
    meta: { name: fields.name },
  });
  revalidatePath('/admin/properties');
  revalidatePath(`/admin/properties/${id}`);
  back(`/admin/properties/${id}`, { notice: 'Property updated.' });
}

export async function deletePropertyAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const id = String(formData.get('propertyId') ?? '');
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) back('/admin/properties', { error: 'Property not found.' });

  const tenancyCount = await prisma.tenancy.count({ where: { unit: { propertyId: id } } });
  if (tenancyCount > 0) {
    back(`/admin/properties/${id}`, {
      error:
        'This property has tenancy history, so it cannot be deleted. End the tenancies first if the building has truly left your portfolio.',
    });
  }

  let error: string | null = null;
  try {
    await prisma.property.delete({ where: { id } });
  } catch {
    error =
      'Could not delete this property — its units still have linked records (applications, work orders, or documents). Remove those first.';
  }
  if (error) back(`/admin/properties/${id}`, { error });

  await audit({
    actorId: user.id,
    action: 'property.deleted',
    entityType: 'Property',
    entityId: id,
    meta: { name: property.name },
  });
  revalidatePath('/admin/properties');
  back('/admin/properties', { notice: `Deleted ${property.name}.` });
}
