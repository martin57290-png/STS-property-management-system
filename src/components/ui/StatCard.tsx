import Link from 'next/link';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const valueColor =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'warn'
        ? 'text-orange-600'
        : tone === 'bad'
          ? 'text-red-600'
          : 'text-gray-900';
  const body = (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
