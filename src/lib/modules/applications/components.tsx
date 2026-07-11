import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, CardSection } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { fmt } from '@/lib/dates';
import { APPLICATION_STEPS, stepIndex, stepPath, type StepSlug } from './steps';
import { monthsLabel, residenceHistoryMonths } from './helpers';
import type { ApplicationDetail } from './queries';

/** Shared chrome for the public (no-login) applicant pages. Mobile-first. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="text-base font-bold text-brand-800">
            STS Property Management
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-gray-700">
            <Link href="/apply" className="hover:text-brand-700">
              Apply
            </Link>
            <Link href="/application-status" className="hover:text-brand-700">
              Application status
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-gray-200 bg-white py-6">
        <p className="text-center text-xs text-gray-500">
          STS Property Management Systems · Equal Housing Opportunity
        </p>
      </footer>
    </div>
  );
}

/** Numbered progress indicator for the application wizard. */
export function WizardProgress({ token, current }: { token: string; current: StepSlug }) {
  const currentIdx = stepIndex(current);
  return (
    <nav aria-label="Application progress" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5">
        {APPLICATION_STEPS.map((step, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
          const circle =
            state === 'done'
              ? 'bg-brand-600 text-white'
              : state === 'current'
                ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                : 'bg-white text-gray-500 ring-1 ring-gray-300';
          const label = (
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${circle}`}
              aria-hidden
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
          );
          return (
            <li key={step.slug} className="flex items-center gap-1.5">
              {state === 'todo' ? (
                <span
                  className="flex items-center gap-1.5"
                  title={step.title}
                  aria-label={`Step ${i + 1}: ${step.title} (not started)`}
                >
                  {label}
                </span>
              ) : (
                <Link
                  href={stepPath(token, step.slug)}
                  className="flex items-center gap-1.5"
                  title={step.title}
                  aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${step.title}`}
                >
                  {label}
                  {state === 'current' && (
                    <span className="text-xs font-semibold text-brand-800">{step.shortTitle}</span>
                  )}
                </Link>
              )}
              {i < APPLICATION_STEPS.length - 1 && (
                <span className="h-px w-2 bg-gray-300 sm:w-4" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-gray-500">
        Step {currentIdx + 1} of {APPLICATION_STEPS.length}
      </p>
    </nav>
  );
}

/** Small definition list used across summaries. */
export function Dl({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {item.label}
          </dt>
          <dd className="text-gray-900">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function dash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

/**
 * The full application contents, organized in cards. Used on the applicant
 * review step and the admin detail page.
 */
export function ApplicationSummarySections({ app }: { app: ApplicationDetail }) {
  return (
    <div className="space-y-4">
      <CardSection title="Applicant">
        <Dl
          items={[
            { label: 'Name', value: `${app.firstName} ${app.lastName}` },
            { label: 'Email', value: app.email },
            { label: 'Phone', value: app.phone },
            { label: 'Date of birth', value: app.dateOfBirth ? fmt(app.dateOfBirth) : '—' },
            { label: 'Desired move-in', value: app.moveInDate ? fmt(app.moveInDate) : '—' },
            {
              label: 'Monthly income',
              value: app.monthlyIncomeCents != null ? formatCents(app.monthlyIncomeCents) : '—',
            },
          ]}
        />
      </CardSection>

      <CardSection title={`Co-applicants & occupants (${app.coApplicants.length})`}>
        {app.coApplicants.length === 0 ? (
          <p className="text-sm text-gray-500">None listed — applicant will live alone.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.coApplicants.map((c) => (
              <li key={c.id} className="py-2">
                <p className="font-medium text-gray-900">
                  {c.firstName} {c.lastName}{' '}
                  <Badge tone={c.isOccupantOnly ? 'gray' : 'blue'} className="ml-1">
                    {c.isOccupantOnly ? 'Occupant only' : 'Co-applicant'}
                  </Badge>
                </p>
                <p className="text-gray-600">
                  {dash(c.relationship)} · {dash(c.email)} · {dash(c.phone)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection
        title={`Residence history (${monthsLabel(residenceHistoryMonths(app.residences))})`}
      >
        {app.residences.length === 0 ? (
          <p className="text-sm text-gray-500">No residences added yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.residences.map((r) => (
              <li key={r.id} className="space-y-1 py-2">
                <p className="font-medium text-gray-900">
                  {r.street}, {r.city}, {r.state} {r.zip}{' '}
                  {r.isCurrent && (
                    <Badge tone="green" className="ml-1">
                      Current
                    </Badge>
                  )}
                </p>
                <p className="text-gray-600">
                  {r.moveIn ? fmt(r.moveIn) : '—'} → {r.moveOut ? fmt(r.moveOut) : 'present'}
                  {r.monthlyRentCents != null && <> · rent {formatCents(r.monthlyRentCents)}/mo</>}
                </p>
                <p className="text-gray-600">
                  Landlord: {dash(r.landlordName)} · {dash(r.landlordPhone)} ·{' '}
                  {dash(r.landlordEmail)}
                </p>
                {r.reasonForLeaving && (
                  <p className="text-gray-600">Reason for leaving: {r.reasonForLeaving}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection title={`Employment & income (${app.employments.length})`}>
        {app.employments.length === 0 ? (
          <p className="text-sm text-gray-500">No employment added.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.employments.map((e) => (
              <li key={e.id} className="space-y-1 py-2">
                <p className="font-medium text-gray-900">
                  {e.employer}
                  {e.position && <span className="text-gray-600"> — {e.position}</span>}{' '}
                  {e.isCurrent && (
                    <Badge tone="green" className="ml-1">
                      Current
                    </Badge>
                  )}
                </p>
                <p className="text-gray-600">
                  {e.monthlyIncomeCents != null && (
                    <>{formatCents(e.monthlyIncomeCents)}/mo · </>
                  )}
                  {e.startDate ? fmt(e.startDate) : '—'} →{' '}
                  {e.endDate ? fmt(e.endDate) : 'present'}
                </p>
                {(e.supervisorName || e.supervisorPhone) && (
                  <p className="text-gray-600">
                    Supervisor: {dash(e.supervisorName)} · {dash(e.supervisorPhone)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection title={`Vehicles (${app.vehicles.length})`}>
        {app.vehicles.length === 0 ? (
          <p className="text-sm text-gray-500">No vehicles.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.vehicles.map((v) => (
              <li key={v.id} className="py-2">
                <p className="font-medium text-gray-900">
                  {v.year ? `${v.year} ` : ''}
                  {v.make} {v.model}
                </p>
                <p className="text-gray-600">
                  {dash(v.color)} · plate {dash(v.licensePlate)} {v.state ? `(${v.state})` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection title={`Pets & service animals (${app.pets.length})`}>
        {app.pets.length === 0 ? (
          <p className="text-sm text-gray-500">No pets.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.pets.map((p) => (
              <li key={p.id} className="py-2">
                <p className="font-medium text-gray-900">
                  {p.name ? `${p.name} — ` : ''}
                  {p.type}
                  {p.breed ? ` (${p.breed})` : ''}{' '}
                  {p.isServiceAnimal && (
                    <Badge tone="blue" className="ml-1">
                      Service/assistance animal
                    </Badge>
                  )}
                </p>
                <p className="text-gray-600">
                  {p.weightLbs != null ? `${p.weightLbs} lbs` : '—'} ·{' '}
                  {p.age != null ? `${p.age} yr old` : 'age —'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection title={`Emergency contacts (${app.emergencyContacts.length})`}>
        {app.emergencyContacts.length === 0 ? (
          <p className="text-sm text-gray-500">No emergency contact added.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.emergencyContacts.map((c) => (
              <li key={c.id} className="py-2">
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-gray-600">
                  {dash(c.relationship)} · {c.phone} · {dash(c.email)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <CardSection title={`References (${app.references.length})`}>
        {app.references.length === 0 ? (
          <p className="text-sm text-gray-500">No references added.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {app.references.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-medium text-gray-900">{r.name}</p>
                <p className="text-gray-600">
                  {dash(r.relationship)} · {dash(r.phone)} · {dash(r.email)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardSection>
    </div>
  );
}

/** Inline error banner driven by a ?error= query param. */
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </div>
  );
}
