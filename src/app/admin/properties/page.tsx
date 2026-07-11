import type { Metadata } from 'next';
import Link from 'next/link';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { occupancyPct } from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Properties & Units' };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();

  const properties = await prisma.property.findMany({
    include: {
      units: {
        select: {
          id: true,
          isListed: true,
          tenancies: { where: { status: 'ACTIVE' }, select: { id: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div>
      <PageHeader
        title="Properties & Units"
        description="Your portfolio: buildings, units, occupancy, and listings."
        actions={<ButtonLink href="/admin/properties/new">Add property</ButtonLink>}
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Add your first building to start tracking units, tenancies, and rent."
          action={<ButtonLink href="/admin/properties/new">Add property</ButtonLink>}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Property</Th>
                <Th>Address</Th>
                <Th>Units</Th>
                <Th>Occupancy</Th>
                <Th>Listed</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {properties.map((property) => {
                const total = property.units.length;
                const occupied = property.units.filter((u) => u.tenancies.length > 0).length;
                const listed = property.units.filter((u) => u.isListed).length;
                const pct = occupancyPct(occupied, total);
                return (
                  <tr key={property.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/admin/properties/${property.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {property.name}
                      </Link>
                      {property.yearBuilt != null && property.yearBuilt < 1978 && (
                        <p className="text-xs text-orange-600">
                          Built {property.yearBuilt} — lead-paint disclosure required
                        </p>
                      )}
                    </Td>
                    <Td>
                      {property.street}, {property.city}, {property.state} {property.zip}
                    </Td>
                    <Td>{total}</Td>
                    <Td>
                      {total === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <Badge tone={pct === 100 ? 'green' : pct >= 75 ? 'yellow' : 'red'}>
                          {pct}% ({occupied}/{total})
                        </Badge>
                      )}
                    </Td>
                    <Td>{listed > 0 ? <Badge tone="blue">{listed} listed</Badge> : '—'}</Td>
                    <Td>
                      <ButtonLink
                        href={`/admin/properties/${property.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Manage
                      </ButtonLink>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
