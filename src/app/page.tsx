import Link from 'next/link';
import { prisma } from '@/lib/db';
import { ButtonLink } from '@/components/ui';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const listedUnits = await prisma.unit.findMany({
    where: { isListed: true },
    include: { property: true },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
  });

  return (
    <main>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold text-brand-800">STS Property Management</span>
          <nav className="flex items-center gap-3">
            <Link href="/apply" className="text-sm font-medium text-gray-700 hover:text-brand-700">
              Apply
            </Link>
            <Link
              href="/application-status"
              className="text-sm font-medium text-gray-700 hover:text-brand-700"
            >
              Application status
            </Link>
            <ButtonLink href="/login" variant="secondary" size="sm">
              Sign in
            </ButtonLink>
          </nav>
        </div>
      </header>

      <section className="bg-brand-900 py-16 text-white">
        <div className="mx-auto max-w-5xl px-4">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">
            Quality rental homes, professionally managed.
          </h1>
          <p className="mt-3 max-w-2xl text-brand-100">
            Browse available units and apply online in minutes. Current residents can sign in to
            pay rent, submit maintenance requests, and manage their tenancy.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/apply" size="lg">
              Start an application
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg">
              Resident sign in
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-xl font-bold text-gray-900">Available units</h2>
        {listedUnits.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">
            No units are currently listed. Check back soon, or{' '}
            <Link href="/apply" className="font-medium text-brand-700 underline">
              submit a general application
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listedUnits.map((unit) => (
              <div key={unit.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-gray-900">
                  {unit.property.name} — Unit {unit.unitNumber}
                </p>
                <p className="text-sm text-gray-600">
                  {unit.property.street}, {unit.property.city}, {unit.property.state}{' '}
                  {unit.property.zip}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  {unit.bedrooms} bd · {unit.bathrooms} ba{unit.sqft ? ` · ${unit.sqft} sqft` : ''}
                </p>
                <p className="mt-1 text-lg font-bold text-brand-800">
                  {formatCents(unit.marketRentCents)}/mo
                </p>
                <div className="mt-3">
                  <ButtonLink href={`/apply?unit=${unit.id}`} size="sm">
                    Apply for this unit
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-gray-200 bg-white py-6">
        <p className="text-center text-xs text-gray-500">
          STS Property Management Systems · Equal Housing Opportunity
        </p>
      </footer>
    </main>
  );
}
