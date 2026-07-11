import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  Card,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  TYPE_TONES,
  shortUnitLabel,
  tenantNames,
} from '@/lib/modules/inspections/helpers';
import { scheduleInspection } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inspections' };

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const [inspections, tenancies] = await Promise.all([
    prisma.inspection.findMany({
      include: {
        tenancy: {
          include: {
            unit: { include: { property: true } },
            tenants: { include: { user: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenancy.findMany({
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
      },
      orderBy: [{ unit: { property: { name: 'asc' } } }, { unit: { unitNumber: 'asc' } }],
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Inspections"
        description="Move-in and move-out condition reports, joint acknowledgements, and security deposit dispositions."
      />

      {searchParams.error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {searchParams.error}
        </div>
      )}

      <CardSection title="Schedule an inspection" className="mb-6">
        {tenancies.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tenancies exist yet. Inspections are tied to a tenancy — create one first.
          </p>
        ) : (
          <form
            action={scheduleInspection}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
          >
            <FormField label="Tenancy" htmlFor="tenancyId" required className="sm:col-span-2">
              <Select id="tenancyId" name="tenancyId" required defaultValue="">
                <option value="" disabled>
                  Select a tenancy…
                </option>
                {tenancies.map((t) => (
                  <option key={t.id} value={t.id}>
                    {shortUnitLabel(t.unit)} — {tenantNames(t.tenants) || 'No tenants yet'} (
                    {t.status.toLowerCase()})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" htmlFor="type" required>
              <Select id="type" name="type" required defaultValue="MOVE_IN">
                <option value="MOVE_IN">Move-in</option>
                <option value="MOVE_OUT">Move-out</option>
              </Select>
            </FormField>
            <FormField label="Scheduled for" htmlFor="scheduledAt" required>
              <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
            </FormField>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton pendingText="Scheduling…">Schedule inspection</SubmitButton>
              <p className="mt-2 text-xs text-gray-500">
                A room-by-room checklist is created automatically from the unit&apos;s bedroom and
                bathroom count, and tenants are notified by email and text.
              </p>
            </div>
          </form>
        )}
      </CardSection>

      {inspections.length === 0 ? (
        <EmptyState
          title="No inspections yet"
          description="Schedule a move-in or move-out inspection above to get started."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Tenancy / unit</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Scheduled</Th>
                <Th>Completed</Th>
                <Th>Acknowledgements</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/admin/inspections/${inspection.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {shortUnitLabel(inspection.tenancy.unit)}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {tenantNames(inspection.tenancy.tenants) || 'No tenants'}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={TYPE_TONES[inspection.type]}>{TYPE_LABELS[inspection.type]}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONES[inspection.status]}>
                      {STATUS_LABELS[inspection.status]}
                    </Badge>
                  </Td>
                  <Td>{inspection.scheduledAt ? fmtDateTime(inspection.scheduledAt) : '—'}</Td>
                  <Td>{inspection.completedAt ? fmtDateTime(inspection.completedAt) : '—'}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={inspection.tenantAckAt ? 'green' : 'gray'}>
                        {inspection.tenantAckAt ? 'Tenant signed' : 'Tenant pending'}
                      </Badge>
                      <Badge tone={inspection.landlordAckAt ? 'green' : 'gray'}>
                        {inspection.landlordAckAt ? 'Landlord signed' : 'Landlord pending'}
                      </Badge>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <ButtonLink
                        href={`/admin/inspections/${inspection.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Open
                      </ButtonLink>
                      {inspection.type === 'MOVE_OUT' && (
                        <ButtonLink
                          href={`/admin/inspections/${inspection.id}/compare`}
                          variant="ghost"
                          size="sm"
                        >
                          Compare
                        </ButtonLink>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
