import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmt, openAge, daysSince } from '@/lib/dates';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatCard,
} from '@/components/ui';
import {
  effectivePriority,
  isOpenStatus,
  PRIORITY_STYLES,
  STATUS_LABELS,
} from '@/lib/escalation';
import {
  ALL_STATUSES,
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  parseCategory,
  parsePriority,
  parseStatus,
  PRIORITY_BORDER,
  PRIORITY_RANK,
  shortUnitLabel,
  STATUS_TONES,
  tenantNames,
  woNumber,
} from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Work orders' };

type SortKey = 'priority' | 'age' | 'unit';

export default async function WorkOrderBoardPage({
  searchParams,
}: {
  searchParams: {
    property?: string;
    status?: string;
    priority?: string;
    category?: string;
    tenancy?: string;
    sort?: string;
    notice?: string;
    error?: string;
  };
}) {
  const [settings, properties, workOrders] = await Promise.all([
    getSettings(),
    prisma.property.findMany({ orderBy: { name: 'asc' } }),
    prisma.workOrder.findMany({
      include: {
        unit: { include: { property: true } },
        tenancy: { include: { tenants: { include: { user: true } } } },
        vendor: true,
        _count: { select: { documents: true, comments: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const rows = workOrders.map((wo) => ({ wo, effective: effectivePriority(wo, settings) }));
  const openRows = rows.filter((r) => isOpenStatus(r.wo.status));

  const openCountBy = (p: (typeof ALL_PRIORITIES)[number]) =>
    openRows.filter((r) => r.effective === p).length;

  // ── Filters ────────────────────────────────────────────────────────────────
  const propertyFilter = properties.find((p) => p.id === searchParams.property)?.id;
  const statusParam = searchParams.status ?? 'open'; // default: open statuses only
  const statusFilter = parseStatus(statusParam);
  const priorityFilter = parsePriority(searchParams.priority ?? '');
  const categoryFilter = parseCategory(searchParams.category ?? '');
  const sort: SortKey =
    searchParams.sort === 'age' || searchParams.sort === 'unit' ? searchParams.sort : 'priority';

  let filtered = rows;
  if (statusFilter) filtered = filtered.filter((r) => r.wo.status === statusFilter);
  else if (statusParam !== 'all') filtered = filtered.filter((r) => isOpenStatus(r.wo.status));
  if (propertyFilter) filtered = filtered.filter((r) => r.wo.unit.propertyId === propertyFilter);
  if (priorityFilter) filtered = filtered.filter((r) => r.effective === priorityFilter);
  if (categoryFilter) filtered = filtered.filter((r) => r.wo.category === categoryFilter);
  // Deep-link filter from the tenancies hub (/admin/tenancies/[id]).
  const tenancyFilter = searchParams.tenancy;
  if (tenancyFilter) filtered = filtered.filter((r) => r.wo.tenancyId === tenancyFilter);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'priority') {
      const rank = PRIORITY_RANK[a.effective] - PRIORITY_RANK[b.effective];
      if (rank !== 0) return rank;
      return a.wo.createdAt.getTime() - b.wo.createdAt.getTime(); // oldest first within a tier
    }
    if (sort === 'age') {
      return a.wo.createdAt.getTime() - b.wo.createdAt.getTime();
    }
    return (
      a.wo.unit.property.name.localeCompare(b.wo.unit.property.name) ||
      a.wo.unit.unitNumber.localeCompare(b.wo.unit.unitNumber, undefined, { numeric: true }) ||
      a.wo.createdAt.getTime() - b.wo.createdAt.getTime()
    );
  });

  const hasFilters =
    Boolean(propertyFilter || priorityFilter || categoryFilter || tenancyFilter) ||
    statusParam !== 'open';

  return (
    <div>
      <PageHeader
        title="Work orders"
        description="Maintenance board — color-coded by effective priority, with automatic escalation as tickets age."
        actions={
          <ButtonLink href="/admin/vendors" variant="secondary" size="sm">
            Vendors
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open — emergency"
          value={openCountBy('EMERGENCY')}
          href="/admin/work-orders?priority=EMERGENCY"
          tone={openCountBy('EMERGENCY') > 0 ? 'bad' : 'default'}
          sub="Incl. escalated tickets"
        />
        <StatCard
          label="Open — urgent"
          value={openCountBy('URGENT')}
          href="/admin/work-orders?priority=URGENT"
          tone={openCountBy('URGENT') > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Open — routine"
          value={openCountBy('ROUTINE')}
          href="/admin/work-orders?priority=ROUTINE"
        />
        <StatCard
          label="Open — low"
          value={openCountBy('LOW')}
          href="/admin/work-orders?priority=LOW"
          tone="good"
        />
      </div>

      <Card className="mb-4">
        <form method="GET" action="/admin/work-orders" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="property" className="mb-1 block text-sm font-medium text-gray-800">
              Property
            </label>
            <Select id="property" name="property" defaultValue={propertyFilter ?? ''} className="w-48">
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-800">
              Status
            </label>
            <Select
              id="status"
              name="status"
              defaultValue={statusFilter ?? (statusParam === 'all' ? 'all' : 'open')}
              className="w-44"
            >
              <option value="open">All open</option>
              <option value="all">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="priority" className="mb-1 block text-sm font-medium text-gray-800">
              Priority (effective)
            </label>
            <Select id="priority" name="priority" defaultValue={priorityFilter ?? ''} className="w-40">
              <option value="">Any</option>
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_STYLES[p].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-800">
              Category
            </label>
            <Select id="category" name="category" defaultValue={categoryFilter ?? ''} className="w-48">
              <option value="">Any</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="sort" className="mb-1 block text-sm font-medium text-gray-800">
              Sort by
            </label>
            <Select id="sort" name="sort" defaultValue={sort} className="w-40">
              <option value="priority">Priority</option>
              <option value="age">Age (oldest first)</option>
              <option value="unit">Unit</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters && (
            <ButtonLink href="/admin/work-orders" variant="ghost" size="sm">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          title="No work orders found"
          description={
            hasFilters
              ? 'Nothing matches these filters. Try clearing them.'
              : 'Tickets tenants submit from the resident portal will appear here.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map(({ wo, effective }) => {
            const escalated = isOpenStatus(wo.status) && effective !== wo.priority;
            const open = isOpenStatus(wo.status);
            return (
              <li key={wo.id}>
                <Link
                  href={`/admin/work-orders/${wo.id}`}
                  className={`block rounded-lg border border-gray-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow ${PRIORITY_BORDER[effective]}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">
                          {woNumber(wo.number)}
                        </span>
                        <Badge tone={STATUS_TONES[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>
                        {wo.isHabitability && (
                          <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                            Habitability
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-semibold text-gray-900">{wo.title}</p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {shortUnitLabel(wo.unit)}
                        {wo.tenancy && wo.tenancy.tenants.length > 0 && (
                          <> · {tenantNames(wo.tenancy.tenants)}</>
                        )}{' '}
                        · {CATEGORY_LABELS[wo.category]}
                        {wo.vendor && <> · vendor: {wo.vendor.name}</>}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {open ? (
                          <span className="font-medium text-gray-700">
                            open {openAge(wo.createdAt)}
                          </span>
                        ) : (
                          <>submitted {fmt(wo.createdAt)}</>
                        )}
                        {wo.scheduledFor && <> · scheduled {fmt(wo.scheduledFor)}</>} ·{' '}
                        {wo._count.documents} media · {wo._count.comments} comments
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {escalated ? (
                        <>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[wo.priority].badge}`}
                            >
                              {PRIORITY_STYLES[wo.priority].label}
                            </span>
                            <span aria-hidden className="text-xs font-bold text-gray-500">
                              ↑
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
                            >
                              {PRIORITY_STYLES[effective].label}
                            </span>
                          </span>
                          <span className="text-xs text-gray-500">
                            escalated — open {daysSince(wo.createdAt)} days
                          </span>
                        </>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
                        >
                          {PRIORITY_STYLES[effective].label}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
