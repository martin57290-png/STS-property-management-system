import type { Metadata } from 'next';
import { requireLandlord } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { fmt } from '@/lib/dates';
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
import { getRentRoll } from '@/lib/modules/dashboard/reports';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Rent roll' };

export default async function RentRollReportPage() {
  await requireLandlord();
  const rows = await getRentRoll();

  const occupied = rows.filter((r) => r.actualRentCents != null);
  const monthlyActual = occupied.reduce((sum, r) => sum + (r.actualRentCents ?? 0), 0);
  const totalOwed = rows.reduce((sum, r) => sum + Math.max(0, r.balanceCents ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Rent roll"
        description={`${rows.length} units · ${occupied.length} occupied · ${formatCents(monthlyActual)}/mo scheduled · ${formatCents(totalOwed)} outstanding`}
        actions={
          <>
            <ButtonLink href="/admin/reports" variant="secondary">
              All reports
            </ButtonLink>
            <ButtonLink href="/api/reports/rent-roll">Download CSV</ButtonLink>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No units yet"
          description="Add properties and units and the rent roll will build itself."
          action={<ButtonLink href="/admin/properties/new">Add property</ButtonLink>}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Property</Th>
                <Th>Unit</Th>
                <Th>Beds / Baths</Th>
                <Th>Market rent</Th>
                <Th>Actual rent</Th>
                <Th>Tenants</Th>
                <Th>Lease end</Th>
                <Th>Balance</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <tr key={row.unitId} className="hover:bg-gray-50">
                  <Td>{row.propertyName}</Td>
                  <Td className="font-medium">{row.unitNumber}</Td>
                  <Td>
                    {row.bedrooms} bd / {row.bathrooms} ba
                  </Td>
                  <Td>{formatCents(row.marketRentCents)}</Td>
                  <Td>
                    {row.actualRentCents == null ? (
                      <Badge tone="yellow">Vacant</Badge>
                    ) : (
                      formatCents(row.actualRentCents)
                    )}
                  </Td>
                  <Td>{row.tenantNames.join(', ') || '—'}</Td>
                  <Td>{row.leaseEnd ? fmt(row.leaseEnd) : '—'}</Td>
                  <Td>
                    {row.balanceCents == null ? (
                      '—'
                    ) : row.balanceCents > 0 ? (
                      <span className="font-semibold text-red-600">
                        {formatCents(row.balanceCents)}
                      </span>
                    ) : (
                      formatCents(row.balanceCents)
                    )}
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
