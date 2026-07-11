import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardSection,
  EmptyState,
  PageHeader,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { occupancyPct } from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { deletePropertyAction } from '../actions';
import { toggleUnitListedAction } from './units/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Property' };

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      units: {
        include: {
          tenancies: {
            where: { status: 'ACTIVE' },
            include: { tenants: { include: { user: true } } },
          },
        },
        orderBy: { unitNumber: 'asc' },
      },
    },
  });
  if (!property) notFound();

  const occupied = property.units.filter((u) => u.tenancies.length > 0).length;
  const hasTenancyHistory =
    (await prisma.tenancy.count({ where: { unit: { propertyId: property.id } } })) > 0;

  return (
    <div>
      <PageHeader
        title={property.name}
        description={`${property.street}, ${property.city}, ${property.state} ${property.zip}`}
        actions={
          <>
            <ButtonLink href="/admin/properties" variant="secondary">
              All properties
            </ButtonLink>
            <ButtonLink href={`/admin/properties/${property.id}/edit`} variant="secondary">
              Edit property
            </ButtonLink>
            <ButtonLink href={`/admin/properties/${property.id}/units/new`}>Add unit</ButtonLink>
          </>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <Card className="mb-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Units</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{property.units.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Occupancy
            </dt>
            <dd className="mt-0.5 font-semibold text-gray-900">
              {property.units.length === 0
                ? '—'
                : `${occupancyPct(occupied, property.units.length)}% (${occupied}/${property.units.length})`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Year built
            </dt>
            <dd className="mt-0.5 font-semibold text-gray-900">
              {property.yearBuilt ?? '—'}
              {property.yearBuilt != null && property.yearBuilt < 1978 && (
                <span className="ml-2 align-middle">
                  <Badge tone="orange">Lead-paint disclosure</Badge>
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{property.notes || '—'}</dd>
          </div>
        </dl>
      </Card>

      <CardSection title="Units" className="mb-6">
        {property.units.length === 0 ? (
          <EmptyState
            title="No units yet"
            description="Add each rentable unit with its beds, baths, rent, and deposit."
            action={
              <ButtonLink href={`/admin/properties/${property.id}/units/new`}>Add unit</ButtonLink>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Unit</Th>
                <Th>Beds / Baths</Th>
                <Th>Sqft</Th>
                <Th>Market rent</Th>
                <Th>Deposit</Th>
                <Th>Occupant</Th>
                <Th>Listed</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {property.units.map((unit) => {
                const tenancy = unit.tenancies[0];
                return (
                  <tr key={unit.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/admin/properties/${property.id}/units/${unit.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {unit.unitNumber}
                      </Link>
                    </Td>
                    <Td>
                      {unit.bedrooms} bd / {unit.bathrooms} ba
                    </Td>
                    <Td>{unit.sqft ?? '—'}</Td>
                    <Td>{formatCents(unit.marketRentCents)}</Td>
                    <Td>{formatCents(unit.depositCents)}</Td>
                    <Td>
                      {tenancy ? (
                        <Link
                          href={`/admin/tenancies/${tenancy.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {tenancy.tenants.map((t) => t.user.name).join(', ') || 'Tenancy'}
                        </Link>
                      ) : (
                        <Badge tone="yellow">Vacant</Badge>
                      )}
                    </Td>
                    <Td>
                      <form action={toggleUnitListedAction}>
                        <input type="hidden" name="unitId" value={unit.id} />
                        {unit.isListed ? (
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            title="Stop accepting applications"
                          >
                            <Badge tone="green">Listed</Badge>
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            title="Accept applications — shows on the public site"
                          >
                            <Badge tone="gray">Not listed</Badge>
                          </Button>
                        )}
                      </form>
                    </Td>
                    <Td>
                      <ButtonLink
                        href={`/admin/properties/${property.id}/units/${unit.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Edit
                      </ButtonLink>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardSection>

      <CardSection title="Danger zone">
        {hasTenancyHistory ? (
          <p className="text-sm text-gray-500">
            This property has tenancy history and cannot be deleted. That history backs your
            ledgers, deposits, and disclosures.
          </p>
        ) : (
          <form action={deletePropertyAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="propertyId" value={property.id} />
            <SubmitButton variant="danger" pendingText="Deleting…">
              Delete property
            </SubmitButton>
            <p className="text-sm text-gray-500">
              Permanently removes the property and its units. Only possible while no tenancies
              exist.
            </p>
          </form>
        )}
      </CardSection>
    </div>
  );
}
