import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { Card, EmptyState, FormField, Input, SubmitButton } from '@/components/ui';
import { ErrorBanner, PublicShell } from '@/lib/modules/applications/components';
import { startApplication } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Apply' };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: { unit?: string; error?: string };
}) {
  const listedUnits = await prisma.unit.findMany({
    where: { isListed: true },
    include: { property: true },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
  });
  const preselected = searchParams.unit;
  const preselectedValid = listedUnits.some((u) => u.id === preselected);

  return (
    <PublicShell>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Rental application</h1>
      <p className="mt-1 text-sm text-gray-600">
        Applying takes about 10 minutes. Your progress is saved at every step, so you can pause and
        come back using your application link. Already applied?{' '}
        <a href="/application-status" className="font-medium text-brand-700 underline">
          Check your status
        </a>
        .
      </p>

      <div className="mt-6">
        <ErrorBanner message={searchParams.error} />

        {listedUnits.length === 0 ? (
          <EmptyState
            title="No units are accepting applications right now"
            description="Please check back soon — new listings are posted as units become available."
          />
        ) : (
          <Card>
            <form action={startApplication} className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-900">
                  1. Choose a unit <span className="text-red-600" aria-hidden>*</span>
                </legend>
                <div className="space-y-2">
                  {listedUnits.map((unit, i) => (
                    <label
                      key={unit.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 text-sm hover:border-brand-400 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        name="unitId"
                        value={unit.id}
                        required
                        defaultChecked={
                          preselectedValid ? unit.id === preselected : i === 0 && listedUnits.length === 1
                        }
                        className="mt-1 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                      />
                      <span>
                        <span className="block font-semibold text-gray-900">
                          {unit.property.name} — Unit {unit.unitNumber}
                        </span>
                        <span className="block text-gray-600">
                          {unit.property.street}, {unit.property.city}, {unit.property.state}{' '}
                          {unit.property.zip}
                        </span>
                        <span className="block text-gray-700">
                          {unit.bedrooms} bd · {unit.bathrooms} ba
                          {unit.sqft ? ` · ${unit.sqft} sqft` : ''} ·{' '}
                          <span className="font-semibold">{formatCents(unit.marketRentCents)}/mo</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-900">
                  2. Your contact information
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="First name" htmlFor="firstName" required>
                    <Input id="firstName" name="firstName" autoComplete="given-name" required />
                  </FormField>
                  <FormField label="Last name" htmlFor="lastName" required>
                    <Input id="lastName" name="lastName" autoComplete="family-name" required />
                  </FormField>
                  <FormField label="Email" htmlFor="email" required>
                    <Input id="email" name="email" type="email" autoComplete="email" required />
                  </FormField>
                  <FormField label="Phone" htmlFor="phone" required>
                    <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
                  </FormField>
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                <SubmitButton pendingText="Starting…">Start application</SubmitButton>
              </div>
            </form>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
