import type { Metadata } from 'next';
import { requireLandlord } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import {
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
import { getIncomeReport } from '@/lib/modules/dashboard/reports';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Income by property' };

export default async function IncomeReportPage() {
  await requireLandlord();
  const report = await getIncomeReport();

  return (
    <div>
      <PageHeader
        title="Income by property"
        description={`Succeeded payments over the last 12 months (Pacific time buckets) · ${formatCents(report.grandTotalCents)} total`}
        actions={
          <>
            <ButtonLink href="/admin/reports" variant="secondary">
              All reports
            </ButtonLink>
            <ButtonLink href="/api/reports/income">Download CSV</ButtonLink>
          </>
        }
      />

      {report.rows.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Add properties and collect rent, then income will roll up here by month."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th className="sticky left-0 bg-gray-50">Property</Th>
                {report.months.map((m) => (
                  <Th key={m.key} className="whitespace-nowrap text-right">
                    {m.label}
                  </Th>
                ))}
                <Th className="text-right">Total</Th>
              </tr>
            </THead>
            <TBody>
              {report.rows.map((row) => (
                <tr key={row.propertyId} className="hover:bg-gray-50">
                  <Td className="sticky left-0 bg-white font-medium">{row.propertyName}</Td>
                  {report.months.map((m) => {
                    const cents = row.byMonth[m.key] ?? 0;
                    return (
                      <Td key={m.key} className="whitespace-nowrap text-right tabular-nums">
                        {cents === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          formatCents(cents)
                        )}
                      </Td>
                    );
                  })}
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {formatCents(row.totalCents)}
                  </Td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <Td className="sticky left-0 bg-gray-50">All properties</Td>
                {report.months.map((m) => (
                  <Td key={m.key} className="whitespace-nowrap text-right tabular-nums">
                    {formatCents(report.monthTotals[m.key] ?? 0)}
                  </Td>
                ))}
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {formatCents(report.grandTotalCents)}
                </Td>
              </tr>
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
