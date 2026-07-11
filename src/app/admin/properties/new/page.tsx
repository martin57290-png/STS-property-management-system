import type { Metadata } from 'next';
import { requireLandlord } from '@/lib/auth';
import { ButtonLink, CardSection, PageHeader } from '@/components/ui';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { PropertyForm } from '../_components/property-form';
import { createPropertyAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Add property' };

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add property"
        description="A building or parcel; you'll add its rentable units next."
        actions={
          <ButtonLink href="/admin/properties" variant="secondary">
            Back to properties
          </ButtonLink>
        }
      />
      <Flash notice={searchParams.notice} error={searchParams.error} />
      <CardSection>
        <PropertyForm action={createPropertyAction} submitLabel="Create property" />
      </CardSection>
    </div>
  );
}
