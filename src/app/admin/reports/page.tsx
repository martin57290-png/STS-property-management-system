import type { Metadata } from 'next';
import Link from 'next/link';
import { requireLandlord } from '@/lib/auth';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Reports' };

const REPORTS = [
  {
    href: '/admin/reports/rent-roll',
    title: 'Rent roll',
    description:
      'Every unit with market vs. actual rent, tenants, lease end dates, and outstanding balances.',
  },
  {
    href: '/admin/reports/income',
    title: 'Income by property',
    description: 'Collected rent per property per month over the last 12 months.',
  },
  {
    href: '/admin/reports/maintenance',
    title: 'Maintenance spend',
    description: 'Work-order costs grouped by property and by category.',
  },
];

export default async function ReportsPage() {
  await requireLandlord();
  return (
    <div>
      <PageHeader
        title="Reports"
        description="On-screen summaries with CSV downloads for your accountant."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow">
              <h2 className="text-base font-semibold text-brand-700 group-hover:underline">
                {report.title}
              </h2>
              <p className="mt-1 text-sm text-gray-600">{report.description}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                View report + CSV →
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
