import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { fmt, fmtDateTime, toDateInputValue } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import {
  Badge,
  Button,
  ButtonLink,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  StatCard,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { DocumentLink } from '@/components/documents';
import {
  DEDUCTION_CATEGORIES,
  photoKeyList,
  shortUnitLabel,
  tenantNames,
} from '@/lib/modules/inspections/helpers';
import { addDeduction, finalizeDisposition, removeDeduction, setMoveOutDate } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Deposit disposition' };

const DAY_MS = 86_400_000;

export default async function DepositDispositionPage({
  params,
  searchParams,
}: {
  params: { tenancyId: string };
  searchParams: { error?: string; notice?: string };
}) {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: params.tenancyId },
    include: {
      unit: { include: { property: true } },
      tenants: { include: { user: true } },
      inspections: { select: { id: true, type: true, status: true } },
    },
  });
  if (!tenancy) notFound();

  // Create-or-load the disposition worksheet for this tenancy.
  const disposition = await prisma.depositDisposition.upsert({
    where: { tenancyId: tenancy.id },
    create: { tenancyId: tenancy.id, depositCents: tenancy.depositCents },
    update: {},
    include: { deductions: { orderBy: { id: 'asc' } } },
  });

  const moveOutInspection = tenancy.inspections.find((i) => i.type === 'MOVE_OUT') ?? null;

  const photoDocs = moveOutInspection
    ? await prisma.document.findMany({
        where: {
          category: 'INSPECTION_PHOTO',
          inspectionItem: { inspectionId: moveOutInspection.id },
        },
        include: { inspectionItem: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const photoOptions = await Promise.all(
    photoDocs.map(async (doc) => ({
      doc,
      url: await getStorage().getSignedUrl(doc.storageKey),
    })),
  );
  const photoByKey = new Map(photoDocs.map((d) => [d.storageKey, d]));

  const totalDeductions = disposition.deductions.reduce((sum, d) => sum + d.amountCents, 0);
  const refundCents = disposition.depositCents - totalDeductions;
  const finalized = Boolean(disposition.finalizedAt);

  const pdfDocument = disposition.pdfKey
    ? await prisma.document.findUnique({ where: { storageKey: disposition.pdfKey } })
    : null;

  // 21-day deadline countdown (Civ. Code § 1950.5(g)).
  let deadlineBanner: ReactNode = null;
  if (finalized) {
    deadlineBanner = (
      <div
        className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        role="status"
      >
        <p className="font-semibold">
          Statement finalized on {fmtDateTime(disposition.finalizedAt)}.
        </p>
        {disposition.statementDueDate && (
          <p className="mt-1">
            Statutory deadline was {fmt(disposition.statementDueDate)} (21 days after move-out,
            Civ. Code § 1950.5(g)).
          </p>
        )}
      </div>
    );
  } else if (!disposition.moveOutDate || !disposition.statementDueDate) {
    deadlineBanner = (
      <div
        className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
        role="status"
      >
        <p className="font-semibold">Set the move-out date to start the 21-day clock.</p>
        <p className="mt-1">
          California Civ. Code § 1950.5(g) requires the itemized statement and any refund within 21
          calendar days after the tenant vacates.
        </p>
      </div>
    );
  } else {
    const daysLeft = Math.ceil((disposition.statementDueDate.getTime() - Date.now()) / DAY_MS);
    if (daysLeft < 0) {
      deadlineBanner = (
        <div
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <p className="text-base font-bold">
            OVERDUE — the itemized statement was due {fmt(disposition.statementDueDate)} (
            {Math.abs(daysLeft)} day{Math.abs(daysLeft) === 1 ? '' : 's'} ago).
          </p>
          <p className="mt-1">
            Civ. Code § 1950.5(g) requires delivery within 21 days of move-out. Finalize and send
            the statement immediately — bad-faith retention can expose you to statutory damages of
            up to twice the deposit.
          </p>
        </div>
      );
    } else {
      const urgent = daysLeft <= 5;
      deadlineBanner = (
        <div
          className={`mb-6 rounded-md border p-4 text-sm ${
            urgent
              ? 'border-orange-300 bg-orange-50 text-orange-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
          role="status"
        >
          <p className="text-base font-bold">
            {daysLeft === 0
              ? 'Due TODAY'
              : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`}{' '}
            — itemized statement due by {fmt(disposition.statementDueDate)}.
          </p>
          <p className="mt-1">
            21 calendar days after move-out ({fmt(disposition.moveOutDate)}), per Civ. Code §
            1950.5(g).
          </p>
        </div>
      );
    }
  }

  return (
    <div>
      <PageHeader
        title={`Security deposit disposition — ${shortUnitLabel(tenancy.unit)}`}
        description={`Tenants: ${tenantNames(tenancy.tenants) || '—'} · Deposit held: ${formatCents(disposition.depositCents)}`}
        actions={
          <>
            <ButtonLink href="/admin/inspections" variant="ghost" size="sm">
              All inspections
            </ButtonLink>
            {moveOutInspection && (
              <ButtonLink
                href={`/admin/inspections/${moveOutInspection.id}/compare`}
                variant="secondary"
                size="sm"
              >
                Move-in vs. move-out comparison
              </ButtonLink>
            )}
          </>
        }
      />

      {searchParams.error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {searchParams.error}
        </div>
      )}
      {searchParams.notice && (
        <div
          className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {searchParams.notice}
        </div>
      )}

      {deadlineBanner}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Deposit held" value={formatCents(disposition.depositCents)} />
        <StatCard
          label="Total deductions"
          value={formatCents(totalDeductions)}
          tone={totalDeductions > 0 ? 'warn' : 'default'}
          sub={`${disposition.deductions.length} line item(s)`}
        />
        <StatCard
          label={refundCents >= 0 ? 'Amount to return' : 'Balance owed by tenant'}
          value={formatCents(Math.abs(refundCents))}
          tone={refundCents >= 0 ? 'good' : 'bad'}
        />
      </div>

      <CardSection title="Move-out date & 21-day deadline" className="mb-6">
        {finalized ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Move-out date</dt>
              <dd className="text-gray-900">{fmt(disposition.moveOutDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Statement due</dt>
              <dd className="text-gray-900">{fmt(disposition.statementDueDate)}</dd>
            </div>
          </dl>
        ) : (
          <form
            action={setMoveOutDate.bind(null, tenancy.id)}
            className="flex flex-wrap items-end gap-3"
          >
            <FormField
              label="Move-out date"
              htmlFor="moveOutDate"
              required
              hint="The itemized statement is due 21 calendar days after this date."
            >
              <Input
                id="moveOutDate"
                name="moveOutDate"
                type="date"
                required
                defaultValue={toDateInputValue(disposition.moveOutDate)}
                className="w-44"
              />
            </FormField>
            <SubmitButton variant="secondary" pendingText="Saving…">
              Save move-out date
            </SubmitButton>
            {disposition.statementDueDate && (
              <p className="text-sm text-gray-600">
                Statement due: <span className="font-semibold">{fmt(disposition.statementDueDate)}</span>
              </p>
            )}
          </form>
        )}
      </CardSection>

      <CardSection title="Itemized deductions" className="mb-6">
        {disposition.deductions.length === 0 ? (
          <EmptyState
            title="No deductions"
            description="With no deductions, the full deposit is returned to the tenant."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Photo references</Th>
                <Th className="text-right">Amount</Th>
                {!finalized && (
                  <Th>
                    <span className="sr-only">Remove</span>
                  </Th>
                )}
              </tr>
            </THead>
            <TBody>
              {disposition.deductions.map((deduction) => {
                const keys = photoKeyList(deduction.photoKeys);
                return (
                  <tr key={deduction.id}>
                    <Td>
                      <Badge tone="gray">{deduction.category}</Badge>
                    </Td>
                    <Td>{deduction.description}</Td>
                    <Td>
                      {keys.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs text-gray-600">
                          {keys.map((key) => {
                            const doc = photoByKey.get(key);
                            return (
                              <li key={key}>
                                {doc
                                  ? `${doc.filename}${doc.inspectionItem ? ` (${doc.inspectionItem.room} — ${doc.inspectionItem.item})` : ''}`
                                  : key}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Td>
                    <Td className="text-right font-medium">{formatCents(deduction.amountCents)}</Td>
                    {!finalized && (
                      <Td>
                        <form action={removeDeduction.bind(null, tenancy.id, deduction.id)}>
                          <Button type="submit" variant="danger" size="sm">
                            Remove
                          </Button>
                        </form>
                      </Td>
                    )}
                  </tr>
                );
              })}
              <tr className="bg-gray-50">
                <Td colSpan={2} className="font-semibold text-gray-900">
                  Total deductions
                </Td>
                <Td />
                <Td className="text-right font-semibold text-gray-900">
                  {formatCents(totalDeductions)}
                </Td>
                {!finalized && <Td />}
              </tr>
            </TBody>
          </Table>
        )}

        {!finalized && (
          <form
            action={addDeduction.bind(null, tenancy.id)}
            className="mt-6 space-y-4 border-t border-gray-200 pt-4"
          >
            <p className="text-sm font-semibold text-gray-900">Add a deduction</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Category" htmlFor="deduction-category" required>
                <Select id="deduction-category" name="category" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {DEDUCTION_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Description" htmlFor="deduction-description" required>
                <Input
                  id="deduction-description"
                  name="description"
                  required
                  placeholder="e.g. Repair hole in bedroom 1 wall"
                />
              </FormField>
              <FormField label="Amount ($)" htmlFor="deduction-amount" required>
                <Input
                  id="deduction-amount"
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="150.00"
                />
              </FormField>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-800">
                Photo references (from the move-out inspection)
              </legend>
              {photoOptions.length === 0 ? (
                <p className="text-xs text-gray-500">
                  {moveOutInspection
                    ? 'No photos have been uploaded to the move-out inspection yet. Photos attached to checklist items appear here as selectable evidence.'
                    : 'No move-out inspection exists for this tenancy yet — schedule one to attach photo evidence to deductions.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {photoOptions.map(({ doc, url }) => (
                    <label
                      key={doc.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        name="photoKeys"
                        value={doc.storageKey}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={doc.filename}
                        className="h-12 w-12 flex-none rounded object-cover"
                      />
                      <span className="min-w-0 text-xs text-gray-700">
                        <span className="block truncate font-medium">
                          {doc.inspectionItem
                            ? `${doc.inspectionItem.room} — ${doc.inspectionItem.item}`
                            : 'Inspection photo'}
                        </span>
                        <span className="block truncate text-gray-500">{doc.filename}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <SubmitButton pendingText="Adding…">Add deduction</SubmitButton>
          </form>
        )}
      </CardSection>

      <CardSection title="Itemized statement (PDF)" className="mb-6">
        {finalized ? (
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              Finalized {fmtDateTime(disposition.finalizedAt)}. Deliver this statement to the
              tenant with any refund due.
            </p>
            {pdfDocument ? (
              <p>
                <DocumentLink doc={pdfDocument} label="Download the disposition statement (PDF)" />
              </p>
            ) : (
              disposition.pdfKey && (
                <p>
                  <a
                    href={`/api/inspections/disposition/${tenancy.id}/pdf`}
                    className="font-medium text-brand-700 underline hover:text-brand-900"
                  >
                    Download the disposition statement (PDF)
                  </a>
                </p>
              )
            )}
          </div>
        ) : (
          <form action={finalizeDisposition.bind(null, tenancy.id)} className="space-y-3">
            <p className="text-sm text-gray-600">
              Finalizing locks the worksheet and produces the itemized security-deposit disposition
              statement required by Civ. Code § 1950.5(g): deposit held{' '}
              <span className="font-semibold">{formatCents(disposition.depositCents)}</span>, total
              deductions <span className="font-semibold">{formatCents(totalDeductions)}</span>,{' '}
              {refundCents >= 0 ? (
                <>
                  amount returned{' '}
                  <span className="font-semibold text-green-700">{formatCents(refundCents)}</span>.
                </>
              ) : (
                <>
                  balance owed by tenant{' '}
                  <span className="font-semibold text-red-700">
                    {formatCents(Math.abs(refundCents))}
                  </span>
                  .
                </>
              )}
            </p>
            {!disposition.moveOutDate && (
              <p className="text-sm font-medium text-orange-700">
                Set the move-out date above before finalizing.
              </p>
            )}
            <SubmitButton pendingText="Generating PDF…">Finalize & export PDF</SubmitButton>
          </form>
        )}
      </CardSection>
    </div>
  );
}
