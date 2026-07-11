import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  Card,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Textarea,
} from '@/components/ui';
import { Flash } from '@/lib/modules/work-orders/flash';
import { createVendor, deleteVendor } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Vendors' };

const OPEN_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'SCHEDULED', 'IN_PROGRESS'] as const;

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  const [vendors, totals] = await Promise.all([
    prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { workOrders: { where: { status: { in: [...OPEN_STATUSES] } } } },
        },
      },
    }),
    prisma.workOrder.groupBy({
      by: ['vendorId'],
      where: { vendorId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const totalFor = (vendorId: string) =>
    totals.find((t) => t.vendorId === vendorId)?._count._all ?? 0;

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Contact book for plumbers, electricians, and other contractors you assign to work orders."
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          description="Add your go-to contractors below so you can assign them to work orders."
        />
      ) : (
        <Card padded={false} className="mb-6">
          <Table>
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Specialty</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Open tickets</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/admin/vendors/${vendor.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {vendor.name}
                    </Link>
                  </Td>
                  <Td>{vendor.company ?? '—'}</Td>
                  <Td>{vendor.specialty ?? '—'}</Td>
                  <Td>
                    {vendor.phone ? (
                      <a href={`tel:${vendor.phone}`} className="hover:underline">
                        {vendor.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {vendor.email ? (
                      <a href={`mailto:${vendor.email}`} className="hover:underline">
                        {vendor.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {vendor._count.workOrders > 0 ? (
                      <Link
                        href="/admin/work-orders"
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {vendor._count.workOrders}
                      </Link>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/vendors/${vendor.id}`}
                        className="text-sm font-semibold text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                      {totalFor(vendor.id) === 0 && (
                        <form action={deleteVendor.bind(null, vendor.id)}>
                          <SubmitButton variant="ghost" pendingText="Deleting…">
                            <span className="text-red-600">Delete</span>
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CardSection title="Add a vendor" className="max-w-2xl">
        <form action={createVendor} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="name" required>
            <Input id="name" name="name" required autoComplete="off" />
          </FormField>
          <FormField label="Company" htmlFor="company">
            <Input id="company" name="company" autoComplete="off" />
          </FormField>
          <FormField label="Specialty" htmlFor="specialty" hint="e.g. plumbing, electrical, HVAC">
            <Input id="specialty" name="specialty" autoComplete="off" />
          </FormField>
          <FormField label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" autoComplete="off" />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="off" />
          </FormField>
          <FormField label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={2} />
          </FormField>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Adding…">Add vendor</SubmitButton>
          </div>
        </form>
      </CardSection>
    </div>
  );
}
