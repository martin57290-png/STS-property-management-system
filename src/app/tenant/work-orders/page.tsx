import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { fmt, openAge } from '@/lib/dates';
import { Badge, ButtonLink, EmptyState, PageHeader } from '@/components/ui';
import {
  effectivePriority,
  isOpenStatus,
  PRIORITY_STYLES,
  STATUS_LABELS,
} from '@/lib/escalation';
import {
  CATEGORY_LABELS,
  PRIORITY_BORDER,
  shortUnitLabel,
  STATUS_TONES,
  woNumber,
} from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Maintenance requests' };

export default async function TenantWorkOrdersPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div>
        <PageHeader
          title="Maintenance requests"
          description="Report problems in your home and track their progress."
        />
        <EmptyState
          title="No tenancy on file"
          description="Once your tenancy is set up, you can submit maintenance requests here."
        />
      </div>
    );
  }

  const [settings, workOrders] = await Promise.all([
    getSettings(),
    prisma.workOrder.findMany({
      where: { tenancyId: tenancy.id },
      include: {
        vendor: true,
        _count: {
          select: {
            documents: true,
            comments: { where: { visibleToTenant: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const open = workOrders.filter((wo) => isOpenStatus(wo.status));
  const closed = workOrders.filter((wo) => !isOpenStatus(wo.status));

  return (
    <div>
      <PageHeader
        title="Maintenance requests"
        description={`Requests for ${shortUnitLabel(tenancy.unit)}.`}
        actions={<ButtonLink href="/tenant/work-orders/new">New request</ButtonLink>}
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {workOrders.length === 0 ? (
        <EmptyState
          title="No maintenance requests yet"
          description="Something broken or not working? Let us know and we'll get it fixed."
          action={<ButtonLink href="/tenant/work-orders/new">Submit a request</ButtonLink>}
        />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="open-requests">
            <h2 id="open-requests" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Open ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="text-sm text-gray-500">No open requests — everything is taken care of.</p>
            ) : (
              <ul className="space-y-3">
                {open.map((wo) => {
                  const effective = effectivePriority(wo, settings);
                  return (
                    <li key={wo.id}>
                      <Link
                        href={`/tenant/work-orders/${wo.id}`}
                        className={`block rounded-lg border border-gray-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow ${PRIORITY_BORDER[effective]}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">
                            {woNumber(wo.number)}
                          </span>
                          <Badge tone={STATUS_TONES[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
                          >
                            {PRIORITY_STYLES[effective].label}
                          </span>
                        </div>
                        <p className="mt-1.5 font-semibold text-gray-900">{wo.title}</p>
                        <p className="mt-0.5 text-sm text-gray-600">
                          {CATEGORY_LABELS[wo.category]} · open {openAge(wo.createdAt)}
                          {wo.scheduledFor && ` · scheduled ${fmt(wo.scheduledFor)}`}
                          {wo.vendor &&
                            ` · assigned to ${wo.vendor.name}${wo.vendor.company ? ` (${wo.vendor.company})` : ''}`}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {wo._count.documents} photo/video{wo._count.documents === 1 ? '' : 's'} ·{' '}
                          {wo._count.comments} comment{wo._count.comments === 1 ? '' : 's'}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {closed.length > 0 && (
            <section aria-labelledby="closed-requests">
              <h2
                id="closed-requests"
                className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500"
              >
                Completed &amp; closed ({closed.length})
              </h2>
              <ul className="space-y-3">
                {closed.map((wo) => (
                  <li key={wo.id}>
                    <Link
                      href={`/tenant/work-orders/${wo.id}`}
                      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">
                          {woNumber(wo.number)}
                        </span>
                        <Badge tone={STATUS_TONES[wo.status]}>{STATUS_LABELS[wo.status]}</Badge>
                      </div>
                      <p className="mt-1.5 font-semibold text-gray-900">{wo.title}</p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {CATEGORY_LABELS[wo.category]} · submitted {fmt(wo.createdAt)}
                        {wo.completedAt && ` · completed ${fmt(wo.completedAt)}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
