import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Document } from '@prisma/client';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import {
  Badge,
  ButtonLink,
  CardSection,
  FormField,
  PageHeader,
  SubmitButton,
} from '@/components/ui';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { UnitForm } from '../../../_components/unit-form';
import {
  deleteUnitAction,
  deleteUnitPhotoAction,
  updateUnitAction,
  uploadUnitPhotosAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit unit' };

/** Photo grid with signed URLs and a per-photo delete button. */
async function PhotoGrid({ docs }: { docs: Document[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-gray-500">No photos yet. Upload some below.</p>;
  }
  const items = await Promise.all(
    docs.map(async (doc) => ({ doc, url: await getStorage().getSignedUrl(doc.storageKey) })),
  );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map(({ doc, url }) => (
        <li key={doc.id} className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={doc.filename} className="h-32 w-full object-cover" />
          </a>
          <form action={deleteUnitPhotoAction} className="flex justify-end p-1.5">
            <input type="hidden" name="documentId" value={doc.id} />
            <SubmitButton variant="ghost" pendingText="Deleting…" className="!px-2 !py-1 !text-xs">
              Delete
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default async function EditUnitPage({
  params,
  searchParams,
}: {
  params: { id: string; unitId: string };
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();

  const unit = await prisma.unit.findUnique({
    where: { id: params.unitId },
    include: {
      property: true,
      tenancies: { where: { status: 'ACTIVE' }, select: { id: true } },
      _count: { select: { tenancies: true } },
    },
  });
  if (!unit || unit.propertyId !== params.id) notFound();

  const photos = await prisma.document.findMany({
    where: { unitId: unit.id, category: 'UNIT_PHOTO' },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Unit ${unit.unitNumber} — ${unit.property.name}`}
        description={`${unit.property.street}, ${unit.property.city}`}
        actions={
          <>
            {unit.tenancies.length > 0 ? (
              <Badge tone="green" className="self-center">
                Occupied
              </Badge>
            ) : (
              <Badge tone="yellow" className="self-center">
                Vacant
              </Badge>
            )}
            <ButtonLink href={`/admin/properties/${unit.propertyId}`} variant="secondary">
              Back to property
            </ButtonLink>
          </>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <CardSection title="Unit details" className="mb-6">
        <UnitForm
          action={updateUnitAction}
          propertyId={unit.propertyId}
          unit={unit}
          submitLabel="Save unit"
        />
      </CardSection>

      <CardSection title="Unit photos" className="mb-6">
        <PhotoGrid docs={photos} />
        <form action={uploadUnitPhotosAction} className="mt-4 space-y-3">
          <input type="hidden" name="unitId" value={unit.id} />
          <FormField
            label="Add photos"
            htmlFor="photos"
            hint="JPEG, PNG, WebP, or HEIC — up to 15 MB each. Used on the public listing and for your records."
          >
            <input
              id="photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              required
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
            />
          </FormField>
          <SubmitButton pendingText="Uploading…">Upload photos</SubmitButton>
        </form>
      </CardSection>

      <CardSection title="Danger zone">
        {unit._count.tenancies > 0 ? (
          <p className="text-sm text-gray-500">
            This unit has tenancy history and cannot be deleted.
          </p>
        ) : (
          <form action={deleteUnitAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="unitId" value={unit.id} />
            <SubmitButton variant="danger" pendingText="Deleting…">
              Delete unit
            </SubmitButton>
            <p className="text-sm text-gray-500">
              Permanently removes the unit and its photos. Only possible while no tenancies exist.
            </p>
          </form>
        )}
      </CardSection>
    </div>
  );
}
