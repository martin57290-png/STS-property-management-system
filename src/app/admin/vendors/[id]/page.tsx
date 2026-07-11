import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import {
  Badge,
  ButtonLink,
  CardSection,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
  Textarea,
} from '@/components/ui';
import { STATUS_LABELS } from '@/lib/escalation';
import { shortUnitLabel, STATUS_TONES, woNumber } from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';
import { deleteVendor, updateVendor } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit vendor' };

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      workOrders: {
        include: { unit: { include: { property: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!vendor) notFound();

  const save = updateVendor.bind(null, vendor.id);
  const remove = deleteVendor.bind(null, vendor.id);

  return (
    <div>
      <PageHeader
        title={vendor.name}
        description={vendor.company ?? 'Vendor'}
        actions={
          <ButtonLink href="/admin/vendors" variant="ghost" size="sm">
            Back to vendors
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CardSection title="Contact details">
          <form action={save} className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="name" required>
              <Input id="name" name="name" required defaultValue={vendor.name} />
            </FormField>
            <FormField label="Company" htmlFor="company">
              <Input id="company" name="company" defaultValue={vendor.company ?? ''} />
            </FormField>
            <FormField label="Specialty" htmlFor="specialty">
              <Input id="specialty" name="specialty" defaultValue={vendor.specialty ?? ''} />
            </FormField>
            <FormField label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={vendor.phone ?? ''} />
            </FormField>
            <FormField label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={vendor.email ?? ''} />
            </FormField>
            <FormField label="Notes" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={3} defaultValue={vendor.notes ?? ''} />
            </FormField>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <SubmitButton pendingText="Saving…">Save vendor</SubmitButton>
            </div>
          </form>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <form action={remove}>
              <SubmitButton variant="danger" pendingText="Deleting…">
                Delete vendor
              </SubmitButton>
            </form>
            <p className="mt-2 text-xs text-gray-500">
              Deletion is blocked while the vendor is assigned to any work orders — reassign those
              tickets first.
            </p>
          </div>
        </CardSection>

        <CardSection title={`Work orders (${vendor.workOrders.length})`}>
          {vendor.workOrders.length === 0 ? (
            <p className="text-sm text-gray-500">No work orders assigned to this vendor yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {vendor.workOrders.map((wo) => (
                <li key={wo.id} className="py-2.5">
                  <Link
                    href={`/admin/work-orders/${wo.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {woNumber(wo.number)} — {wo.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Badge tone={STATUS_TONES[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>
                    <span>{shortUnitLabel(wo.unit)}</span>
                    <span>submitted {fmt(wo.createdAt)}</span>
                    {wo.costCents != null && <span>cost {formatCents(wo.costCents)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </div>
    </div>
  );
}
