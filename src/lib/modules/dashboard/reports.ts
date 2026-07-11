/**
 * Server-side report queries + CSV builders, shared by the on-screen report
 * pages (/admin/reports/*) and the CSV download routes (/api/reports/*).
 */
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '@/lib/db';
import { APP_TZ, fmt, laDateToUtc, toDateInputValue } from '@/lib/dates';
import { centsToDollarString } from '@/lib/money';
import { entrySign } from '@/lib/ledger';
import { WORK_ORDER_CATEGORY_LABELS } from './helpers';

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Encode rows as RFC-4180-ish CSV with quoting. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((cell) => {
            const s = cell == null ? '' : String(cell);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}

function csvDollars(cents: number | null | undefined): string {
  return cents == null ? '' : centsToDollarString(cents);
}

// ─── Balances (single query for the whole portfolio) ────────────────────────

/** Balance owed per tenancy (positive = tenant owes), computed in one query. */
export async function computeBalancesByTenancy(): Promise<Map<string, number>> {
  const groups = await prisma.ledgerEntry.groupBy({
    by: ['tenancyId', 'type'],
    _sum: { amountCents: true },
  });
  const map = new Map<string, number>();
  for (const g of groups) {
    map.set(g.tenancyId, (map.get(g.tenancyId) ?? 0) + entrySign(g.type) * (g._sum.amountCents ?? 0));
  }
  return map;
}

// ─── Rent roll ───────────────────────────────────────────────────────────────

export type RentRollRow = {
  unitId: string;
  propertyName: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRentCents: number;
  actualRentCents: number | null;
  tenantNames: string[];
  leaseEnd: Date | null;
  balanceCents: number | null;
  tenancyId: string | null;
};

export async function getRentRoll(): Promise<RentRollRow[]> {
  const [units, balances] = await Promise.all([
    prisma.unit.findMany({
      include: {
        property: true,
        tenancies: {
          where: { status: 'ACTIVE' },
          include: {
            tenants: { include: { user: true } },
            leases: {
              where: { status: { in: ['ACTIVE', 'EXECUTED'] } },
              orderBy: { endDate: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    }),
    computeBalancesByTenancy(),
  ]);

  return units.map((unit) => {
    const tenancy = unit.tenancies[0] ?? null;
    const lease = tenancy?.leases[0] ?? null;
    return {
      unitId: unit.id,
      propertyName: unit.property.name,
      unitNumber: unit.unitNumber,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      sqft: unit.sqft,
      marketRentCents: unit.marketRentCents,
      actualRentCents: tenancy ? tenancy.rentCents : null,
      tenantNames: tenancy ? tenancy.tenants.map((t) => t.user.name) : [],
      leaseEnd: lease?.endDate ?? tenancy?.endDate ?? null,
      balanceCents: tenancy ? (balances.get(tenancy.id) ?? 0) : null,
      tenancyId: tenancy?.id ?? null,
    };
  });
}

export function rentRollCsv(rows: RentRollRow[]): string {
  return toCsv([
    [
      'Property',
      'Unit',
      'Beds',
      'Baths',
      'Sqft',
      'Market rent',
      'Actual rent',
      'Tenants',
      'Lease end',
      'Balance owed',
    ],
    ...rows.map((r) => [
      r.propertyName,
      r.unitNumber,
      r.bedrooms,
      r.bathrooms,
      r.sqft ?? '',
      csvDollars(r.marketRentCents),
      r.actualRentCents == null ? 'VACANT' : csvDollars(r.actualRentCents),
      r.tenantNames.join('; '),
      r.leaseEnd ? toDateInputValue(r.leaseEnd) : '',
      csvDollars(r.balanceCents),
    ]),
  ]);
}

// ─── Income by property ──────────────────────────────────────────────────────

export type MonthBucket = { key: string; label: string; start: Date };

/** The last `n` calendar months (oldest first) on the LA calendar. */
export function lastNMonthsLA(n: number): MonthBucket[] {
  const [y, m] = formatInTimeZone(new Date(), APP_TZ, 'yyyy-MM').split('-').map(Number);
  const months: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    // Normalize year/month arithmetic without Date-object timezone pitfalls.
    const total = y * 12 + (m - 1) - i;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1; // 1-based
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const start = laDateToUtc(`${key}-01`);
    months.push({ key, label: fmt(start, 'MMM yyyy'), start });
  }
  return months;
}

export type IncomeReport = {
  months: MonthBucket[];
  rows: {
    propertyId: string;
    propertyName: string;
    byMonth: Record<string, number>;
    totalCents: number;
  }[];
  monthTotals: Record<string, number>;
  grandTotalCents: number;
};

/** SUCCEEDED payment volume per property per month, last 12 LA months. */
export async function getIncomeReport(): Promise<IncomeReport> {
  const months = lastNMonthsLA(12);
  const [properties, payments] = await Promise.all([
    prisma.property.findMany({ orderBy: { name: 'asc' } }),
    prisma.payment.findMany({
      where: { status: 'SUCCEEDED', createdAt: { gte: months[0].start } },
      select: {
        amountCents: true,
        createdAt: true,
        tenancy: { select: { unit: { select: { propertyId: true } } } },
      },
    }),
  ]);

  const monthKeys = new Set(months.map((m) => m.key));
  const matrix = new Map<string, Record<string, number>>();
  const monthTotals: Record<string, number> = {};
  for (const m of months) monthTotals[m.key] = 0;
  let grandTotalCents = 0;

  for (const p of payments) {
    const key = formatInTimeZone(p.createdAt, APP_TZ, 'yyyy-MM');
    if (!monthKeys.has(key)) continue;
    const propertyId = p.tenancy.unit.propertyId;
    const row = matrix.get(propertyId) ?? {};
    row[key] = (row[key] ?? 0) + p.amountCents;
    matrix.set(propertyId, row);
    monthTotals[key] += p.amountCents;
    grandTotalCents += p.amountCents;
  }

  const rows = properties.map((property) => {
    const byMonth = matrix.get(property.id) ?? {};
    const totalCents = Object.values(byMonth).reduce((sum, c) => sum + c, 0);
    return { propertyId: property.id, propertyName: property.name, byMonth, totalCents };
  });

  return { months, rows, monthTotals, grandTotalCents };
}

export function incomeCsv(report: IncomeReport): string {
  return toCsv([
    ['Property', ...report.months.map((m) => m.label), 'Total'],
    ...report.rows.map((row) => [
      row.propertyName,
      ...report.months.map((m) => csvDollars(row.byMonth[m.key] ?? 0)),
      csvDollars(row.totalCents),
    ]),
    [
      'All properties',
      ...report.months.map((m) => csvDollars(report.monthTotals[m.key] ?? 0)),
      csvDollars(report.grandTotalCents),
    ],
  ]);
}

// ─── Maintenance spend ───────────────────────────────────────────────────────

export type MaintenanceReport = {
  byProperty: { propertyId: string; propertyName: string; totalCents: number; count: number }[];
  byCategory: { category: string; totalCents: number; count: number }[];
  grandTotalCents: number;
  orderCount: number;
};

/** Work-order spend (costCents recorded) grouped by property and category. */
export async function getMaintenanceReport(): Promise<MaintenanceReport> {
  const orders = await prisma.workOrder.findMany({
    where: { costCents: { not: null } },
    select: {
      costCents: true,
      category: true,
      unit: { select: { propertyId: true, property: { select: { name: true } } } },
    },
  });

  const byPropertyMap = new Map<string, { propertyName: string; totalCents: number; count: number }>();
  const byCategoryMap = new Map<string, { totalCents: number; count: number }>();
  let grandTotalCents = 0;

  for (const wo of orders) {
    const cost = wo.costCents ?? 0;
    grandTotalCents += cost;

    const prop = byPropertyMap.get(wo.unit.propertyId) ?? {
      propertyName: wo.unit.property.name,
      totalCents: 0,
      count: 0,
    };
    prop.totalCents += cost;
    prop.count += 1;
    byPropertyMap.set(wo.unit.propertyId, prop);

    const label = WORK_ORDER_CATEGORY_LABELS[wo.category];
    const cat = byCategoryMap.get(label) ?? { totalCents: 0, count: 0 };
    cat.totalCents += cost;
    cat.count += 1;
    byCategoryMap.set(label, cat);
  }

  return {
    byProperty: Array.from(byPropertyMap.entries())
      .map(([propertyId, v]) => ({ propertyId, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents),
    byCategory: Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents),
    grandTotalCents,
    orderCount: orders.length,
  };
}

export function maintenanceCsv(report: MaintenanceReport): string {
  return toCsv([
    ['Maintenance spend by property'],
    ['Property', 'Work orders', 'Total spend'],
    ...report.byProperty.map((r) => [r.propertyName, r.count, csvDollars(r.totalCents)]),
    [],
    ['Maintenance spend by category'],
    ['Category', 'Work orders', 'Total spend'],
    ...report.byCategory.map((r) => [r.category, r.count, csvDollars(r.totalCents)]),
    [],
    ['Grand total', report.orderCount, csvDollars(report.grandTotalCents)],
  ]);
}
