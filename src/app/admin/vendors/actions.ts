'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';

function refresh(): void {
  revalidatePath('/admin/vendors');
  revalidatePath('/admin/work-orders');
}

function readVendorForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? '').trim(),
    company: String(formData.get('company') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    specialty: String(formData.get('specialty') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
  };
}

export async function createVendor(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const data = readVendorForm(formData);
  if (!data.name) {
    redirect(`/admin/vendors?error=${encodeURIComponent('Vendor name is required.')}`);
  }

  const vendor = await prisma.vendor.create({ data });
  await audit({
    actorId: user.id,
    action: 'vendor.created',
    entityType: 'Vendor',
    entityId: vendor.id,
    meta: { name: vendor.name, specialty: vendor.specialty },
  });

  refresh();
  redirect(`/admin/vendors?notice=${encodeURIComponent(`Added vendor “${vendor.name}”.`)}`);
}

export async function updateVendor(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) {
    redirect(`/admin/vendors?error=${encodeURIComponent('Vendor not found.')}`);
  }

  const data = readVendorForm(formData);
  if (!data.name) {
    redirect(`/admin/vendors/${id}?error=${encodeURIComponent('Vendor name is required.')}`);
  }

  await prisma.vendor.update({ where: { id }, data });
  await audit({
    actorId: user.id,
    action: 'vendor.updated',
    entityType: 'Vendor',
    entityId: id,
    meta: { name: data.name },
  });

  refresh();
  revalidatePath(`/admin/vendors/${id}`);
  redirect(`/admin/vendors?notice=${encodeURIComponent(`Saved “${data.name}”.`)}`);
}

export async function deleteVendor(id: string): Promise<void> {
  const user = await requireLandlord();
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { _count: { select: { workOrders: true } } },
  });
  if (!vendor) {
    redirect(`/admin/vendors?error=${encodeURIComponent('Vendor not found.')}`);
  }

  if (vendor._count.workOrders > 0) {
    redirect(
      `/admin/vendors?error=${encodeURIComponent(
        `“${vendor.name}” is assigned to ${vendor._count.workOrders} work order${
          vendor._count.workOrders === 1 ? '' : 's'
        }. Reassign or unassign those tickets before deleting the vendor.`,
      )}`,
    );
  }

  await prisma.vendor.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: 'vendor.deleted',
    entityType: 'Vendor',
    entityId: id,
    meta: { name: vendor.name },
  });

  refresh();
  redirect(`/admin/vendors?notice=${encodeURIComponent(`Deleted “${vendor.name}”.`)}`);
}
