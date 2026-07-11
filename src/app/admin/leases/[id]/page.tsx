import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fmt, fmtDateTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { getStorage } from '@/lib/storage';
import {
  Badge,
  ButtonLink,
  CardSection,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
} from '@/components/ui';
import { DocumentList } from '@/components/documents';
import {
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
  parseStoredDisclosures,
  utilityLabel,
} from '@/lib/modules/leases/helpers';
import {
  activateLeaseAction,
  generateLeasePdfAction,
  setTenantPasswordAction,
  uploadExecutedLeaseAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function LeaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; notice?: string };
}) {
  await requireLandlord();
  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { id: true, name: true } },
      application: { select: { id: true, firstName: true, lastName: true } },
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
      documents: { orderBy: { createdAt: 'desc' } },
      renewedFrom: { select: { id: true, startDate: true, endDate: true, status: true } },
      renewedTo: { select: { id: true, startDate: true, endDate: true, status: true } },
    },
  });
  if (!lease) notFound();

  const { unit } = lease.tenancy;
  const { property } = unit;
  const disclosures = parseStoredDisclosures(lease.disclosures);
  const utilities = Array.isArray(lease.utilitiesIncluded)
    ? (lease.utilitiesIncluded as unknown[]).map(String)
    : [];
  const tenants = [...lease.tenancy.tenants].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );
  const executedSignedUrl = lease.executedPdfKey
    ? await getStorage().getSignedUrl(lease.executedPdfKey)
    : null;
  const canRenew = (lease.status === 'ACTIVE' || lease.status === 'EXECUTED') && !lease.renewedTo;

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Lease — {property.street}, Unit {unit.unitNumber}
            <Badge tone={LEASE_STATUS_TONES[lease.status]}>{LEASE_STATUS_LABELS[lease.status]}</Badge>
            {lease.isRenewal && <Badge tone="purple">Renewal</Badge>}
          </span>
        }
        description={`${tenants.map((t) => t.user.name).join(', ') || 'No tenants'} · ${fmt(lease.startDate)} – ${fmt(lease.endDate)}`}
        actions={
          <>
            {canRenew && (
              <ButtonLink variant="secondary" href={`/admin/leases/${lease.id}/renew`}>
                Generate renewal
              </ButtonLink>
            )}
            <ButtonLink variant="ghost" href="/admin/leases">
              All leases
            </ButtonLink>
          </>
        }
      />

      {searchParams.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {searchParams.error}
        </div>
      )}
      {searchParams.notice && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">
          {searchParams.notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CardSection title="Lease terms">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <TermRow label="Premises" value={`${property.street}, Unit ${unit.unitNumber}, ${property.city}, ${property.state} ${property.zip}`} />
              <TermRow label="Term" value={`${fmt(lease.startDate)} – ${fmt(lease.endDate)}`} />
              <TermRow label="Monthly rent" value={formatCents(lease.rentCents)} />
              <TermRow label="Security deposit" value={formatCents(lease.depositCents)} />
              <TermRow label="Rent due day" value={`Day ${lease.tenancy.rentDueDay} of each month`} />
              <TermRow
                label="Late fee"
                value={
                  lease.lateFeeCents
                    ? `${formatCents(lease.lateFeeCents)} after ${lease.lateFeeGraceDays ?? 0} day grace`
                    : 'None'
                }
              />
              <TermRow
                label="Utilities included"
                value={utilities.length > 0 ? utilities.map(utilityLabel).join(', ') : 'None — tenant pays all'}
              />
              <TermRow label="Pet rent" value={lease.petRentCents ? `${formatCents(lease.petRentCents)}/month` : 'None'} />
              <TermRow
                label="Template"
                value={lease.template ? lease.template.name : 'Built-in default'}
                href={lease.template ? `/admin/leases/templates/${lease.template.id}` : undefined}
              />
              {lease.application && (
                <TermRow
                  label="Application"
                  value={`${lease.application.firstName} ${lease.application.lastName}`}
                  href={`/admin/applications/${lease.application.id}`}
                />
              )}
            </dl>
            {lease.petTerms && (
              <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
                <p className="font-medium text-gray-500">Pet terms</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{lease.petTerms}</p>
              </div>
            )}
            {lease.additionalTerms && (
              <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
                <p className="font-medium text-gray-500">Additional terms</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{lease.additionalTerms}</p>
              </div>
            )}
          </CardSection>

          <CardSection title="California disclosure checklist">
            {Object.keys(disclosures).length === 0 ? (
              <p className="text-sm text-gray-500">No disclosure checklist recorded for this lease.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(disclosures).map(([key, item]) => (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-gray-800">{item.label}</span>
                    <span className="flex items-center gap-2">
                      {item.required ? (
                        <Badge tone="orange">Required</Badge>
                      ) : (
                        <Badge tone="gray">Optional</Badge>
                      )}
                      {item.confirmed ? (
                        <Badge tone="green">Confirmed</Badge>
                      ) : (
                        <Badge tone={item.required ? 'red' : 'gray'}>Not confirmed</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>

          <CardSection title="Documents">
            <DocumentList docs={lease.documents} />
          </CardSection>
        </div>

        <div className="space-y-6">
          <CardSection title="Lease workflow">
            <ol className="space-y-5">
              <li>
                <p className="text-sm font-semibold text-gray-900">1. Generate the lease PDF</p>
                {lease.generatedAt && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Last generated {fmtDateTime(lease.generatedAt)}.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(lease.status === 'DRAFT' || lease.status === 'GENERATED') && (
                    <form action={generateLeasePdfAction}>
                      <input type="hidden" name="leaseId" value={lease.id} />
                      <SubmitButton pendingText="Generating…">
                        {lease.generatedPdfKey ? 'Regenerate lease PDF' : 'Generate lease PDF'}
                      </SubmitButton>
                    </form>
                  )}
                  {lease.generatedPdfKey && (
                    <a
                      href={`/api/leases/${lease.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      View generated PDF
                    </a>
                  )}
                </div>
                {lease.generatedPdfKey && (
                  <p className="mt-2 text-xs text-gray-500">
                    Print the PDF for wet (ink) signature by all parties.
                  </p>
                )}
              </li>
              <li>
                <p className="text-sm font-semibold text-gray-900">2. Upload the executed lease</p>
                {lease.executedAt && (
                  <p className="mt-0.5 text-xs text-gray-500">Uploaded {fmtDateTime(lease.executedAt)}.</p>
                )}
                {executedSignedUrl && (
                  <p className="mt-1 text-sm">
                    <a
                      href={executedSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      View executed lease
                    </a>
                  </p>
                )}
                {lease.status !== 'EXPIRED' && lease.status !== 'TERMINATED' && (
                  <form action={uploadExecutedLeaseAction} className="mt-2 space-y-2">
                    <input type="hidden" name="leaseId" value={lease.id} />
                    <FormField label="Signed lease (PDF or photo)" htmlFor={`executed-file-${lease.id}`}>
                      <Input
                        id={`executed-file-${lease.id}`}
                        name="file"
                        type="file"
                        accept="application/pdf,image/*"
                        required
                      />
                    </FormField>
                    <SubmitButton variant="secondary" pendingText="Uploading…">
                      {lease.executedPdfKey ? 'Replace executed lease' : 'Upload executed lease'}
                    </SubmitButton>
                  </form>
                )}
              </li>
              <li>
                <p className="text-sm font-semibold text-gray-900">3. Activate the tenancy</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Marks the lease and tenancy active
                  {lease.isRenewal ? ' and expires the lease this one renews' : ''}. Rent charges
                  post to active tenancies.
                </p>
                {lease.status === 'EXECUTED' ? (
                  <form action={activateLeaseAction} className="mt-2">
                    <input type="hidden" name="leaseId" value={lease.id} />
                    <SubmitButton pendingText="Activating…">Activate tenancy</SubmitButton>
                  </form>
                ) : lease.status === 'ACTIVE' ? (
                  <p className="mt-2 text-sm font-medium text-green-700">Active since {fmtDateTime(lease.updatedAt)}.</p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">Available once the executed lease is uploaded.</p>
                )}
              </li>
            </ol>
          </CardSection>

          <CardSection title="Tenants & portal access">
            <ul className="space-y-4">
              {tenants.map((tenant) => (
                <li key={tenant.userId} className="rounded-md border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{tenant.user.name}</span>
                    {tenant.isPrimary && <Badge tone="blue">Primary</Badge>}
                    {tenant.user.passwordHash ? (
                      <Badge tone="green">Password set</Badge>
                    ) : (
                      <Badge tone="yellow">No password yet</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {tenant.user.email}
                    {tenant.user.phone ? ` · ${tenant.user.phone}` : ''}
                  </p>
                  <form action={setTenantPasswordAction} className="mt-3 space-y-2">
                    <input type="hidden" name="leaseId" value={lease.id} />
                    <input type="hidden" name="userId" value={tenant.userId} />
                    <FormField
                      label={tenant.user.passwordHash ? 'Reset portal password' : 'Set portal password'}
                      htmlFor={`password-${tenant.userId}`}
                      hint="Min 8 characters. Share it with the tenant securely — they sign in at /login."
                    >
                      <Input
                        id={`password-${tenant.userId}`}
                        name="password"
                        type="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                      />
                    </FormField>
                    <SubmitButton variant="secondary" pendingText="Saving…">
                      {tenant.user.passwordHash ? 'Reset password' : 'Set password'}
                    </SubmitButton>
                  </form>
                </li>
              ))}
              {tenants.length === 0 && <li className="text-sm text-gray-500">No tenants on this tenancy.</li>}
            </ul>
          </CardSection>

          {(lease.renewedFrom || lease.renewedTo) && (
            <CardSection title="Renewal chain">
              <ul className="space-y-2 text-sm">
                {lease.renewedFrom && (
                  <li>
                    Renews{' '}
                    <Link
                      href={`/admin/leases/${lease.renewedFrom.id}`}
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      lease {fmt(lease.renewedFrom.startDate)} – {fmt(lease.renewedFrom.endDate)}
                    </Link>{' '}
                    <Badge tone={LEASE_STATUS_TONES[lease.renewedFrom.status]}>
                      {LEASE_STATUS_LABELS[lease.renewedFrom.status]}
                    </Badge>
                  </li>
                )}
                {lease.renewedTo && (
                  <li>
                    Renewed by{' '}
                    <Link
                      href={`/admin/leases/${lease.renewedTo.id}`}
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      lease {fmt(lease.renewedTo.startDate)} – {fmt(lease.renewedTo.endDate)}
                    </Link>{' '}
                    <Badge tone={LEASE_STATUS_TONES[lease.renewedTo.status]}>
                      {LEASE_STATUS_LABELS[lease.renewedTo.status]}
                    </Badge>
                  </li>
                )}
              </ul>
            </CardSection>
          )}
        </div>
      </div>
    </div>
  );
}

function TermRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900">
        {href ? (
          <Link href={href} className="font-medium text-brand-700 underline hover:text-brand-900">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
