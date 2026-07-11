import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ButtonLink, CardSection, PageHeader } from '@/components/ui';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { PropertyForm } from '../../_components/property-form';
import { updatePropertyAction } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit property' };

export default async function EditPropertyPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();
  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Edit ${property.name}`}
        actions={
          <ButtonLink href={`/admin/properties/${property.id}`} variant="secondary">
            Back to property
          </ButtonLink>
        }
      />
      <Flash notice={searchParams.notice} error={searchParams.error} />
      <CardSection>
        <PropertyForm action={updatePropertyAction} property={property} submitLabel="Save changes" />
      </CardSection>
    </div>
  );
}
