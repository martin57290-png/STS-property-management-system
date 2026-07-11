import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { fmt, fmtDateTime } from '@/lib/dates';
import { centsToDollarString, formatCents } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardSection,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
  Textarea,
} from '@/components/ui';
import { DocumentLink, DocumentList } from '@/components/documents';
import { getApplicationById } from '@/lib/modules/applications/queries';
import {
  applicantName,
  householdSize,
  incomeToRentRatio,
  monthsLabel,
  residenceHistoryMonths,
  STATUS_LABELS,
  STATUS_TONES,
  trackingUrl,
  unitLabel,
} from '@/lib/modules/applications/helpers';
import { ApplicationSummarySections, ErrorBanner } from '@/lib/modules/applications/components';
import { addNote, decideApplication, recordFee } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Application detail' };

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; feeError?: string };
}) {
  const app = await getApplicationById(params.id);
  if (!app) notFound();

  const [notes, settings, activeOnUnit] = await Promise.all([
    prisma.applicationNote.findMany({
      where: { applicationId: app.id },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    }),
    getSettings(),
    prisma.application.count({
      where: { unitId: app.unitId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    }),
  ]);

  const receiptDoc = app.feeReceiptKey
    ? app.documents.find((d) => d.storageKey === app.feeReceiptKey) ?? null
    : null;
  const uploadedDocs = app.documents.filter((d) => d.category !== 'RECEIPT');

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {applicantName(app)}
            <Badge tone={STATUS_TONES[app.status]}>{STATUS_LABELS[app.status]}</Badge>
          </span>
        }
        description={
          <>
            Applying for {unitLabel(app.unit)} ·{' '}
            {app.submittedAt ? `submitted ${fmtDateTime(app.submittedAt)}` : 'not submitted yet'}
          </>
        }
        actions={
          <>
            {activeOnUnit >= 2 && (
              <ButtonLink
                href={`/admin/applications/compare?unit=${app.unitId}`}
                variant="secondary"
                size="sm"
              >
                Compare applicants
              </ButtonLink>
            )}
            <ButtonLink href="/admin/applications" variant="ghost" size="sm">
              ← All applications
            </ButtonLink>
          </>
        }
      />

      <ErrorBanner message={searchParams.error} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="space-y-4 xl:col-span-2">
          <CardSection title="At a glance">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Income
                </dt>
                <dd className="font-semibold text-gray-900">
                  {app.monthlyIncomeCents != null ? formatCents(app.monthlyIncomeCents) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Income / rent
                </dt>
                <dd className="font-semibold text-gray-900">
                  {incomeToRentRatio(app.monthlyIncomeCents, app.unit.marketRentCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Household
                </dt>
                <dd className="font-semibold text-gray-900">
                  {householdSize(app)} {householdSize(app) === 1 ? 'person' : 'people'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Residence history
                </dt>
                <dd className="font-semibold text-gray-900">
                  {monthsLabel(residenceHistoryMonths(app.residences))}
                </dd>
              </div>
            </dl>
          </CardSection>

          <ApplicationSummarySections app={app} />

          <CardSection title={`Uploaded documents (${uploadedDocs.length})`}>
            <DocumentList docs={uploadedDocs} />
          </CardSection>

          <CardSection title={`Internal notes (${notes.length})`}>
            <form action={addNote.bind(null, app.id)} className="mb-4 space-y-3">
              <FormField
                label="Add a note"
                htmlFor="note-body"
                hint="Visible to you only — never shown to the applicant."
              >
                <Textarea id="note-body" name="body" rows={3} required />
              </FormField>
              <SubmitButton variant="secondary" pendingText="Saving…">
                Add note
              </SubmitButton>
            </form>
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500">No notes yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notes.map((note) => (
                  <li key={note.id} className="py-3 text-sm">
                    <p className="whitespace-pre-wrap text-gray-800">{note.body}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {note.author.name} · {fmtDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>
        </div>

        {/* ── Side column ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <CardSection title="Status & decision">
            {app.status === 'APPROVED' && (
              <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                Approved{app.decisionAt ? ` ${fmtDateTime(app.decisionAt)}` : ''}. Next:{' '}
                <Link
                  href={`/admin/leases/new?applicationId=${app.id}`}
                  className="font-semibold underline"
                >
                  generate a lease from this application
                </Link>
                .
              </p>
            )}
            {app.status === 'DENIED' && app.decisionAt && (
              <p className="mb-3 text-sm text-gray-600">Denied {fmtDateTime(app.decisionAt)}.</p>
            )}
            {app.status === 'WAITLISTED' && app.decisionAt && (
              <p className="mb-3 text-sm text-gray-600">
                Waitlisted {fmtDateTime(app.decisionAt)}.
              </p>
            )}
            {app.decisionNote && (
              <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <span className="font-semibold">Decision note:</span> {app.decisionNote}
              </p>
            )}
            <form action={decideApplication.bind(null, app.id)} className="space-y-3">
              <FormField
                label="Note to applicant (optional)"
                htmlFor="decision-note"
                hint="Included in the status-change email and shown on the applicant's status page."
              >
                <Textarea id="decision-note" name="note" rows={2} />
              </FormField>
              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  name="decision"
                  value="UNDER_REVIEW"
                  variant="secondary"
                  disabled={app.status === 'UNDER_REVIEW'}
                >
                  Move to Under Review
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="APPROVED"
                  disabled={app.status === 'APPROVED'}
                >
                  Approve
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="DENIED"
                  variant="danger"
                  disabled={app.status === 'DENIED'}
                >
                  Deny
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="WAITLISTED"
                  variant="secondary"
                  disabled={app.status === 'WAITLISTED'}
                >
                  Waitlist
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Each action emails and texts the applicant with their tracking link.
              </p>
            </form>
          </CardSection>

          <Card
            className={
              app.screeningConsentAt ? 'border-green-300 bg-green-50/50' : 'border-red-300'
            }
          >
            <h2 className="text-base font-semibold text-gray-900">Screening consent (FCRA)</h2>
            {app.screeningConsentAt ? (
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Signed name
                  </dt>
                  <dd className="font-semibold text-gray-900">{app.screeningConsentName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Authorized at
                  </dt>
                  <dd className="text-gray-900">{fmtDateTime(app.screeningConsentAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    IP address
                  </dt>
                  <dd className="text-gray-900">{app.screeningConsentIp ?? 'unknown'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm font-medium text-red-700">
                No written screening authorization on file — do not order a consumer report for
                this applicant.
              </p>
            )}
          </Card>

          <CardSection title="Application fee (§ 1950.6)">
            <ErrorBanner message={searchParams.feeError} />
            {app.feePaidAt ? (
              <div className="space-y-2 text-sm">
                <p className="text-gray-800">
                  <Badge tone="green" className="mr-2">
                    Collected
                  </Badge>
                  {formatCents(app.feeCents)} on {fmt(app.feePaidAt)}
                </p>
                {app.feePaymentRef && (
                  <p className="text-gray-600">Payment reference: {app.feePaymentRef}</p>
                )}
                {receiptDoc ? (
                  <p>
                    <DocumentLink doc={receiptDoc} label="Itemized receipt (PDF)" />
                  </p>
                ) : (
                  <p className="text-gray-600">Receipt on file.</p>
                )}
              </div>
            ) : (
              <form action={recordFee.bind(null, app.id)} className="space-y-3">
                <p className="text-sm text-gray-600">
                  Record the screening fee as collected. An itemized receipt PDF is generated and
                  emailed to the applicant automatically.
                </p>
                <FormField label="Amount collected" htmlFor="fee-amount" required>
                  <Input
                    id="fee-amount"
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={centsToDollarString(settings.applicationFeeCents)}
                  />
                </FormField>
                <FormField
                  label="Payment reference (optional)"
                  htmlFor="fee-ref"
                  hint="e.g. check number, Zelle confirmation, cash"
                >
                  <Input id="fee-ref" name="paymentRef" />
                </FormField>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-gray-800">
                    Itemization (must add up to the amount)
                  </legend>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
                        <div>
                          <label htmlFor={`fee-desc-${i}`} className="sr-only">
                            Line {i} description
                          </label>
                          <Input
                            id={`fee-desc-${i}`}
                            name={`lineDesc${i}`}
                            placeholder={
                              i === 1
                                ? 'Credit report cost'
                                : i === 2
                                  ? 'Time obtaining & processing information'
                                  : `Line ${i} (optional)`
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor={`fee-amt-${i}`} className="sr-only">
                            Line {i} amount in dollars
                          </label>
                          <Input
                            id={`fee-amt-${i}`}
                            name={`lineAmount${i}`}
                            inputMode="decimal"
                            placeholder="$"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave all lines blank to record a single “tenant screening services” line for
                    the full amount.
                  </p>
                </fieldset>
                <SubmitButton pendingText="Recording…">
                  Record fee & generate receipt
                </SubmitButton>
                <p className="text-xs text-gray-500">{settings.applicationFeeCapNote}</p>
              </form>
            )}
          </CardSection>

          <CardSection title="Applicant tracking link">
            <p className="break-all text-xs text-gray-600">{trackingUrl(app.trackingToken)}</p>
            <p className="mt-1 text-xs text-gray-500">
              The applicant uses this private link to track their status.
            </p>
          </CardSection>
        </div>
      </div>
    </div>
  );
}
