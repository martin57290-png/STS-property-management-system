import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { fmt, fmtDateTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { Badge, ButtonLink, Card, CardSection, FormField, Input, SubmitButton } from '@/components/ui';
import { PublicShell } from '@/lib/modules/applications/components';
import {
  APPLICANT_STATUS_MESSAGES,
  STATUS_LABELS,
  STATUS_TONES,
  unitLabel,
} from '@/lib/modules/applications/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Application status' };

function TokenForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Card>
      <form method="GET" action="/application-status" className="space-y-4">
        <FormField
          label="Tracking code"
          htmlFor="token"
          required
          hint="This is the code from your confirmation email or text message. It is also the last part of your application link."
        >
          <Input id="token" name="token" required defaultValue={defaultValue} placeholder="e.g. clx0abc123…" />
        </FormField>
        <SubmitButton pendingText="Checking…">Check status</SubmitButton>
      </form>
    </Card>
  );
}

function TimelineItem({
  state,
  title,
  detail,
  isLast = false,
}: {
  state: 'done' | 'current' | 'pending' | 'stopped';
  title: string;
  detail?: string;
  isLast?: boolean;
}) {
  const circle =
    state === 'done'
      ? 'bg-green-600 text-white'
      : state === 'current'
        ? 'bg-brand-600 text-white'
        : state === 'stopped'
          ? 'bg-red-600 text-white'
          : 'bg-white text-gray-400 ring-1 ring-gray-300';
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!isLast && <span className="absolute left-3 top-7 h-full w-px bg-gray-200" aria-hidden />}
      <span
        className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${circle}`}
        aria-hidden
      >
        {state === 'done' ? '✓' : state === 'stopped' ? '✕' : '•'}
      </span>
      <div>
        <p
          className={`text-sm font-semibold ${state === 'pending' ? 'text-gray-400' : 'text-gray-900'}`}
        >
          {title}
        </p>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
      </div>
    </li>
  );
}

export default async function ApplicationStatusPage({
  searchParams,
}: {
  searchParams: { token?: string; submitted?: string };
}) {
  const token = searchParams.token?.trim();
  const app = token
    ? await prisma.application.findUnique({
        where: { trackingToken: token },
        include: { unit: { include: { property: true } } },
      })
    : null;

  const receiptUrl =
    app?.feeReceiptKey != null ? await getStorage().getSignedUrl(app.feeReceiptKey) : null;

  const decided = app && ['APPROVED', 'DENIED', 'WAITLISTED'].includes(app.status);
  const reviewReached = app && (app.status === 'UNDER_REVIEW' || decided);

  return (
    <PublicShell>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Application status</h1>
      <p className="mt-1 text-sm text-gray-600">
        Enter your tracking code to see where your rental application stands.
      </p>

      <div className="mt-6 space-y-4">
        {searchParams.submitted === '1' && app && (
          <div
            role="status"
            className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            <strong>Application submitted!</strong> A confirmation was sent to {app.email}. Save
            this page&apos;s link — it is how you track your application.
          </div>
        )}

        {token && !app && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            We couldn&apos;t find an application with that tracking code. Double-check the code
            from your confirmation email or text.
          </div>
        )}

        {!app && <TokenForm defaultValue={token} />}

        {app && (
          <>
            <CardSection
              title="Your application"
              actions={<Badge tone={STATUS_TONES[app.status]}>{STATUS_LABELS[app.status]}</Badge>}
            >
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Applicant
                  </dt>
                  <dd className="text-gray-900">
                    {app.firstName} {app.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Unit</dt>
                  <dd className="text-gray-900">{unitLabel(app.unit)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Submitted
                  </dt>
                  <dd className="text-gray-900">
                    {app.submittedAt ? fmtDateTime(app.submittedAt) : 'Not submitted yet'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Asking rent
                  </dt>
                  <dd className="text-gray-900">{formatCents(app.unit.marketRentCents)}/mo</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {APPLICANT_STATUS_MESSAGES[app.status]}
              </p>
            </CardSection>

            {app.status === 'DRAFT' ? (
              <Card>
                <p className="text-sm text-gray-700">
                  Your application hasn&apos;t been submitted yet. Pick up where you left off:
                </p>
                <div className="mt-3">
                  <ButtonLink href={`/apply/${app.trackingToken}`}>Resume application</ButtonLink>
                </div>
              </Card>
            ) : (
              <CardSection title="Progress">
                <ol>
                  <TimelineItem
                    state="done"
                    title="Submitted"
                    detail={app.submittedAt ? fmtDateTime(app.submittedAt) : undefined}
                  />
                  <TimelineItem
                    state={reviewReached ? 'done' : 'current'}
                    title="Under review"
                    detail={
                      reviewReached
                        ? 'Your information and references were reviewed.'
                        : 'Waiting for the landlord to begin review.'
                    }
                  />
                  <TimelineItem
                    isLast
                    state={
                      app.status === 'APPROVED'
                        ? 'done'
                        : app.status === 'DENIED'
                          ? 'stopped'
                          : app.status === 'WAITLISTED'
                            ? 'current'
                            : 'pending'
                    }
                    title={
                      app.status === 'APPROVED'
                        ? 'Approved'
                        : app.status === 'DENIED'
                          ? 'Not approved'
                          : app.status === 'WAITLISTED'
                            ? 'Waitlisted'
                            : 'Decision'
                    }
                    detail={app.decisionAt ? fmtDateTime(app.decisionAt) : 'Pending'}
                  />
                </ol>
                {decided && app.decisionNote && (
                  <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <span className="font-semibold">Note from the landlord:</span>{' '}
                    {app.decisionNote}
                  </div>
                )}
              </CardSection>
            )}

            {app.feePaidAt && (
              <CardSection title="Application fee">
                <p className="text-sm text-gray-700">
                  Screening fee of {formatCents(app.feeCents)} collected on {fmt(app.feePaidAt)}.
                </p>
                {receiptUrl && (
                  <p className="mt-2 text-sm">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      Download your itemized receipt (PDF)
                    </a>
                  </p>
                )}
              </CardSection>
            )}

            <details className="text-sm text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">
                Check a different application
              </summary>
              <div className="mt-3">
                <TokenForm />
              </div>
            </details>
          </>
        )}
      </div>
    </PublicShell>
  );
}
