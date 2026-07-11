'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { parseDollarsToCents } from '@/lib/money';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { getStorage } from '@/lib/storage';
import type { ApplianceRow } from '@/lib/modules/dashboard/helpers';

function back(path: string, params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`${path}?${qs.toString()}`);
}

/** Collect appliance_* rows from the form into a clean JSON array. */
function parseApplianceRows(formData: FormData): ApplianceRow[] {
  const indices = new Set<number>();
  for (const key of Array.from(formData.keys())) {
    const match = /^appliance_name_(\d+)$/.exec(key);
    if (match) indices.add(Number(match[1]));
  }
  const rows: ApplianceRow[] = [];
  for (const i of Array.from(indices).sort((a, b) => a - b)) {
    const name = String(formData.get(`appliance_name_${i}`) ?? '').trim();
    if (!name) continue;
    rows.push({
      name,
      brand: String(formData.get(`appliance_brand_${i}`) ?? '').trim(),
      model: String(formData.get(`appliance_model_${i}`) ?? '').trim(),
      condition: String(formData.get(`appliance_condition_${i}`) ?? '').trim(),
    });
  }
  return rows;
}

type UnitFields = {
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRentCents: number;
  depositCents: number;
  isListed: boolean;
  applianceInventory: Prisma.InputJsonValue;
  notes: string | null;
};

function parseUnitFields(formData: FormData): { fields?: UnitFields; error?: string } {
  const unitNumber = String(formData.get('unitNumber') ?? '').trim();
  if (!unitNumber) return { error: 'Unit number is required.' };

  const bedrooms = Number(String(formData.get('bedrooms') ?? '').trim());
  if (!Number.isInteger(bedrooms) || bedrooms < 0) {
    return { error: 'Bedrooms must be a whole number.' };
  }
  const bathrooms = Number(String(formData.get('bathrooms') ?? '').trim());
  if (!Number.isFinite(bathrooms) || bathrooms < 0) {
    return { error: 'Bathrooms must be a number (halves like 1.5 are fine).' };
  }

  const sqftRaw = String(formData.get('sqft') ?? '').trim();
  let sqft: number | null = null;
  if (sqftRaw) {
    const n = Number(sqftRaw);
    if (!Number.isInteger(n) || n < 0) return { error: 'Square feet must be a whole number.' };
    sqft = n;
  }

  const marketRentCents = parseDollarsToCents(String(formData.get('marketRent') ?? ''));
  if (marketRentCents == null) return { error: 'Enter a valid market rent in dollars.' };
  const depositCents = parseDollarsToCents(String(formData.get('deposit') ?? ''));
  if (depositCents == null) return { error: 'Enter a valid security deposit in dollars.' };

  return {
    fields: {
      unitNumber,
      bedrooms,
      bathrooms,
      sqft,
      marketRentCents,
      depositCents,
      isListed: formData.get('isListed') === 'on',
      applianceInventory: parseApplianceRows(formData) as unknown as Prisma.InputJsonValue,
      notes: String(formData.get('notes') ?? '').trim() || null,
    },
  };
}

export async function createUnitAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const propertyId = String(formData.get('propertyId') ?? '');
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) back('/admin/properties', { error: 'Property not found.' });

  const { fields, error } = parseUnitFields(formData);
  if (!fields) back(`/admin/properties/${propertyId}/units/new`, { error });

  let unitId: string | null = null;
  let createError: string | null = null;
  try {
    const unit = await prisma.unit.create({ data: { propertyId, ...fields } });
    unitId = unit.id;
  } catch (err) {
    createError =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
        ? `Unit ${fields.unitNumber} already exists at ${property.name}.`
        : 'Could not create the unit. Please try again.';
  }
  if (createError || !unitId) {
    back(`/admin/properties/${propertyId}/units/new`, {
      error: createError ?? 'Could not create the unit.',
    });
  }

  await audit({
    actorId: user.id,
    action: 'unit.created',
    entityType: 'Unit',
    entityId: unitId,
    meta: { propertyId, unitNumber: fields.unitNumber },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath('/admin/properties');
  back(`/admin/properties/${propertyId}/units/${unitId}`, {
    notice: `Unit ${fields.unitNumber} created. Add photos below.`,
  });
}

export async function updateUnitAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const propertyId = String(formData.get('propertyId') ?? '');
  const unitId = String(formData.get('unitId') ?? '');
  const unitPath = `/admin/properties/${propertyId}/units/${unitId}`;

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit || unit.propertyId !== propertyId) {
    back(`/admin/properties/${propertyId}`, { error: 'Unit not found.' });
  }

  const { fields, error } = parseUnitFields(formData);
  if (!fields) back(unitPath, { error });

  let updateError: string | null = null;
  try {
    await prisma.unit.update({ where: { id: unitId }, data: fields });
  } catch (err) {
    updateError =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
        ? `Another unit is already numbered ${fields.unitNumber} at this property.`
        : 'Could not save the unit. Please try again.';
  }
  if (updateError) back(unitPath, { error: updateError });

  await audit({
    actorId: user.id,
    action: 'unit.updated',
    entityType: 'Unit',
    entityId: unitId,
    meta: { propertyId, unitNumber: fields.unitNumber, isListed: fields.isListed },
  });
  revalidatePath(unitPath);
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath('/admin/properties');
  back(unitPath, { notice: 'Unit saved.' });
}

/** Quick isListed toggle from the property detail units table. */
export async function toggleUnitListedAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const unitId = String(formData.get('unitId') ?? '');
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) back('/admin/properties', { error: 'Unit not found.' });

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: { isListed: !unit.isListed },
  });
  await audit({
    actorId: user.id,
    action: 'unit.listing_toggled',
    entityType: 'Unit',
    entityId: unitId,
    meta: { isListed: updated.isListed },
  });
  revalidatePath(`/admin/properties/${unit.propertyId}`);
  back(`/admin/properties/${unit.propertyId}`, {
    notice: `Unit ${unit.unitNumber} is ${updated.isListed ? 'now listed and accepting applications' : 'no longer listed'}.`,
  });
}

export async function deleteUnitAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const unitId = String(formData.get('unitId') ?? '');
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) back('/admin/properties', { error: 'Unit not found.' });
  const propertyPath = `/admin/properties/${unit.propertyId}`;

  const tenancyCount = await prisma.tenancy.count({ where: { unitId } });
  if (tenancyCount > 0) {
    back(`${propertyPath}/units/${unitId}`, {
      error:
        'This unit has tenancy history, so it cannot be deleted. Keep it for your records, or end and archive the tenancies first.',
    });
  }

  // Remove the unit's photo documents (and stored files) before deleting.
  const photos = await prisma.document.findMany({ where: { unitId } });

  let error: string | null = null;
  try {
    for (const doc of photos) {
      try {
        await getStorage().delete(doc.storageKey);
      } catch {
        // Missing file in storage should not block deleting the record.
      }
      await prisma.document.delete({ where: { id: doc.id } });
    }
    await prisma.unit.delete({ where: { id: unitId } });
  } catch {
    error =
      'Could not delete this unit — it still has linked records (applications or work orders). Remove those first.';
  }
  if (error) back(`${propertyPath}/units/${unitId}`, { error });

  await audit({
    actorId: user.id,
    action: 'unit.deleted',
    entityType: 'Unit',
    entityId: unitId,
    meta: { propertyId: unit.propertyId, unitNumber: unit.unitNumber },
  });
  revalidatePath(propertyPath);
  revalidatePath('/admin/properties');
  back(propertyPath, { notice: `Deleted unit ${unit.unitNumber}.` });
}

export async function uploadUnitPhotosAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const unitId = String(formData.get('unitId') ?? '');
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) back('/admin/properties', { error: 'Unit not found.' });
  const unitPath = `/admin/properties/${unit.propertyId}/units/${unitId}`;

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) back(unitPath, { error: 'Choose at least one photo to upload.' });

  let uploaded = 0;
  let error: string | null = null;
  try {
    for (const file of files) {
      await saveUpload({
        file,
        kind: 'image',
        category: 'UNIT_PHOTO',
        keyPrefix: `units/${unitId}`,
        uploadedById: user.id,
        owner: { unitId },
      });
      uploaded += 1;
    }
  } catch (err) {
    error =
      err instanceof UploadValidationError
        ? err.message
        : 'Failed to store a photo. Please try again.';
  }

  if (uploaded > 0) {
    await audit({
      actorId: user.id,
      action: 'unit.photos_uploaded',
      entityType: 'Unit',
      entityId: unitId,
      meta: { count: uploaded },
    });
    revalidatePath(unitPath);
  }
  if (error) back(unitPath, { error });
  back(unitPath, { notice: `Uploaded ${uploaded} photo${uploaded === 1 ? '' : 's'}.` });
}

export async function deleteUnitPhotoAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const documentId = String(formData.get('documentId') ?? '');
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || !doc.unitId || doc.category !== 'UNIT_PHOTO') {
    back('/admin/properties', { error: 'Photo not found.' });
  }
  const unit = await prisma.unit.findUnique({ where: { id: doc.unitId } });
  const unitPath = unit
    ? `/admin/properties/${unit.propertyId}/units/${unit.id}`
    : '/admin/properties';

  try {
    await getStorage().delete(doc.storageKey);
  } catch {
    // A missing stored file should not block removing the record.
  }
  await prisma.document.delete({ where: { id: doc.id } });
  await audit({
    actorId: user.id,
    action: 'document.deleted',
    entityType: 'Document',
    entityId: doc.id,
    meta: { unitId: doc.unitId, filename: doc.filename, category: doc.category },
  });
  revalidatePath(unitPath);
  back(unitPath, { notice: 'Photo deleted.' });
}
