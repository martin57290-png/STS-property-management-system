import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ButtonLink, CardSection, PageHeader } from '@/components/ui';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { UnitForm } from '../../../_components/unit-form';
import { createUnitAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Add unit' };

export default async function NewUnitPage({
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
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Add unit — ${property.name}`}
        description={`${property.street}, ${property.city}`}
        actions={
          <ButtonLink href={`/admin/properties/${property.id}`} variant="secondary">
            Back to property
          </ButtonLink>
        }
      />
      <Flash notice={searchParams.notice} error={searchParams.error} />
      <CardSection>
        <UnitForm action={createUnitAction} propertyId={property.id} submitLabel="Create unit" />
      </CardSection>
    </div>
  );
}
