import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
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
import { MediaGrid } from '@/components/documents';
import {
  CONDITION_LABELS,
  CONDITION_RANK,
  CONDITION_TONES,
  conditionWorsened,
  groupItemsByRoom,
  itemMatchKey,
  shortUnitLabel,
  tenantNames,
} from '@/lib/modules/inspections/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Move-out comparison' };

export default async function InspectionComparePage({ params }: { params: { id: string } }) {
  const moveOut = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
      items: {
        include: { documents: { orderBy: { createdAt: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!moveOut) notFound();
  if (moveOut.type !== 'MOVE_OUT') {
    redirect(`/admin/inspections/${params.id}`);
  }

  const moveIn = await prisma.inspection.findUnique({
    where: { tenancyId_type: { tenancyId: moveOut.tenancyId, type: 'MOVE_IN' } },
    include: {
      items: { include: { documents: { orderBy: { createdAt: 'asc' } } } },
    },
  });

  const moveInByKey = new Map(
    (moveIn?.items ?? []).map((item) => [itemMatchKey(item.room, item.item), item]),
  );
  const moveOutKeys = new Set(moveOut.items.map((item) => itemMatchKey(item.room, item.item)));
  const unmatchedMoveIn = (moveIn?.items ?? []).filter(
    (item) => !moveOutKeys.has(itemMatchKey(item.room, item.item)),
  );

  const rooms = groupItemsByRoom(moveOut.items);
  const worsenedCount = moveOut.items.filter((item) => {
    const match = moveInByKey.get(itemMatchKey(item.room, item.item));
    return conditionWorsened(match?.condition, item.condition);
  }).length;

  return (
    <div>
      <PageHeader
        title={`Move-in vs. move-out — ${shortUnitLabel(moveOut.tenancy.unit)}`}
        description={`Tenants: ${tenantNames(moveOut.tenancy.tenants) || '—'} · Rows highlighted in red worsened since move-in and may support a deposit deduction.`}
        actions={
          <>
            <ButtonLink href={`/admin/inspections/${moveOut.id}`} variant="ghost" size="sm">
              Back to inspection
            </ButtonLink>
            <ButtonLink href={`/admin/inspections/disposition/${moveOut.tenancyId}`} size="sm">
              Open disposition worksheet
            </ButtonLink>
          </>
        }
      />

      {!moveIn && (
        <div
          className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"
          role="alert"
        >
          No move-in inspection exists for this tenancy, so there is nothing to compare against.
          Move-out conditions are shown on their own.
        </div>
      )}

      {moveIn && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>
            Move-in inspection{' '}
            {moveIn.completedAt ? `completed ${fmtDateTime(moveIn.completedAt)}` : 'not yet completed'}
          </span>
          <Badge tone={worsenedCount > 0 ? 'red' : 'green'}>
            {worsenedCount > 0
              ? `${worsenedCount} item(s) worsened`
              : 'No items worsened'}
          </Badge>
        </div>
      )}

      {moveOut.items.length === 0 ? (
        <EmptyState
          title="No checklist items"
          description="The move-out inspection has no checklist items to compare."
        />
      ) : (
        rooms.map(({ room, items }) => (
          <Card key={room} padded={false} className="mb-6">
            <h2 className="border-b border-gray-200 px-4 py-3 text-base font-semibold text-gray-900">
              {room}
            </h2>
            <Table>
              <THead>
                <tr>
                  <Th className="min-w-[10rem]">Item</Th>
                  <Th className="min-w-[8rem]">Move-in condition</Th>
                  <Th className="min-w-[14rem]">Move-in notes & photos</Th>
                  <Th className="min-w-[8rem]">Move-out condition</Th>
                  <Th className="min-w-[14rem]">Move-out notes & photos</Th>
                  <Th>Change</Th>
                </tr>
              </THead>
              <TBody>
                {items.map((item) => {
                  const match = moveInByKey.get(itemMatchKey(item.room, item.item));
                  const worsened = conditionWorsened(match?.condition, item.condition);
                  const improved =
                    !!match?.condition &&
                    !!item.condition &&
                    CONDITION_RANK[item.condition] > CONDITION_RANK[match.condition];
                  return (
                    <tr key={item.id} className={worsened ? 'bg-red-50' : undefined}>
                      <Td className="font-medium text-gray-900">{item.item}</Td>
                      <Td>
                        {match?.condition ? (
                          <Badge tone={CONDITION_TONES[match.condition]}>
                            {CONDITION_LABELS[match.condition]}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        {match?.notes && <p className="text-sm text-gray-600">{match.notes}</p>}
                        {match && match.documents.length > 0 && (
                          <div className="mt-2 max-w-xs">
                            <MediaGrid docs={match.documents} />
                          </div>
                        )}
                        {!match?.notes && (!match || match.documents.length === 0) && (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        {item.condition ? (
                          <Badge tone={CONDITION_TONES[item.condition]}>
                            {CONDITION_LABELS[item.condition]}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        {item.notes && <p className="text-sm text-gray-600">{item.notes}</p>}
                        {item.documents.length > 0 && (
                          <div className="mt-2 max-w-xs">
                            <MediaGrid docs={item.documents} />
                          </div>
                        )}
                        {!item.notes && item.documents.length === 0 && (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        {worsened ? (
                          <Badge tone="red">Worsened</Badge>
                        ) : improved ? (
                          <Badge tone="green">Improved</Badge>
                        ) : match?.condition && item.condition ? (
                          <Badge tone="gray">No change</Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        ))
      )}

      {unmatchedMoveIn.length > 0 && (
        <Card padded={false} className="mb-6">
          <h2 className="border-b border-gray-200 px-4 py-3 text-base font-semibold text-gray-900">
            Move-in items with no matching move-out line
          </h2>
          <Table>
            <THead>
              <tr>
                <Th>Room</Th>
                <Th>Item</Th>
                <Th>Move-in condition</Th>
                <Th>Notes</Th>
              </tr>
            </THead>
            <TBody>
              {unmatchedMoveIn.map((item) => (
                <tr key={item.id}>
                  <Td>{item.room}</Td>
                  <Td className="font-medium text-gray-900">{item.item}</Td>
                  <Td>
                    {item.condition ? (
                      <Badge tone={CONDITION_TONES[item.condition]}>
                        {CONDITION_LABELS[item.condition]}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>{item.notes ?? '—'}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
