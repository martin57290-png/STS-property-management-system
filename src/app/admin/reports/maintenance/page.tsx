import type { Metadata } from 'next';
import { requireLandlord } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import {
  ButtonLink,
  CardSection,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { getMaintenanceReport } from '@/lib/modules/dashboard/reports';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Maintenance spend' };

export default async function MaintenanceReportPage() {
  await requireLandlord();
  const report = await getMaintenanceReport();

  return (
    <div>
      <PageHeader
        title="Maintenance spend"
        description="Work orders with a recorded cost, grouped by property and by category."
        actions={
          <>
            <ButtonLink href="/admin/reports" variant="secondary">
              All reports
            </ButtonLink>
            <ButtonLink href="/api/reports/maintenance">Download CSV</ButtonLink>
          </>
        }
      />

      {report.orderCount === 0 ? (
        <EmptyState
          title="No maintenance costs recorded yet"
          description="Record a cost on completed work orders and spend will roll up here."
          action={
            <ButtonLink href="/admin/work-orders" variant="secondary">
              Go to work orders
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:max-w-md">
            <StatCard label="Total spend" value={formatCents(report.grandTotalCents)} />
            <StatCard label="Costed work orders" value={report.orderCount} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CardSection title="By property">
              <Table>
                <THead>
                  <tr>
                    <Th>Property</Th>
                    <Th className="text-right">Work orders</Th>
                    <Th className="text-right">Spend</Th>
                  </tr>
                </THead>
                <TBody>
                  {report.byProperty.map((row) => (
                    <tr key={row.propertyId}>
                      <Td className="font-medium">{row.propertyName}</Td>
                      <Td className="text-right tabular-nums">{row.count}</Td>
                      <Td className="text-right tabular-nums">{formatCents(row.totalCents)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <Td>Total</Td>
                    <Td className="text-right tabular-nums">{report.orderCount}</Td>
                    <Td className="text-right tabular-nums">
                      {formatCents(report.grandTotalCents)}
                    </Td>
                  </tr>
                </TBody>
              </Table>
            </CardSection>

            <CardSection title="By category">
              <Table>
                <THead>
                  <tr>
                    <Th>Category</Th>
                    <Th className="text-right">Work orders</Th>
                    <Th className="text-right">Spend</Th>
                  </tr>
                </THead>
                <TBody>
                  {report.byCategory.map((row) => (
                    <tr key={row.category}>
                      <Td className="font-medium">{row.category}</Td>
                      <Td className="text-right tabular-nums">{row.count}</Td>
                      <Td className="text-right tabular-nums">{formatCents(row.totalCents)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <Td>Total</Td>
                    <Td className="text-right tabular-nums">{report.orderCount}</Td>
                    <Td className="text-right tabular-nums">
                      {formatCents(report.grandTotalCents)}
                    </Td>
                  </tr>
                </TBody>
              </Table>
            </CardSection>
          </div>
        </>
      )}
    </div>
  );
}
