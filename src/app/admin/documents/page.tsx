import type { Metadata } from 'next';
import Link from 'next/link';
import type { DocumentCategory, Prisma } from '@prisma/client';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/dates';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { DocumentLink } from '@/components/documents';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_TONES,
  formatBytes,
  VAULT_UPLOAD_CATEGORIES,
} from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { deleteVaultDocumentAction, uploadVaultDocumentAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Document Vault' };

const ALL_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[];

type VaultDocument = Prisma.DocumentGetPayload<{
  include: {
    application: { select: { id: true; firstName: true; lastName: true } };
    tenancy: {
      select: {
        id: true;
        unit: { select: { unitNumber: true; property: { select: { name: true } } } };
      };
    };
    lease: {
      select: {
        id: true;
        tenancy: {
          select: {
            unit: { select: { unitNumber: true; property: { select: { name: true } } } };
          };
        };
      };
    };
    unit: {
      select: {
        id: true;
        propertyId: true;
        unitNumber: true;
        property: { select: { name: true } };
      };
    };
    property: { select: { id: true; name: true } };
    workOrder: { select: { id: true; number: true } };
    inspectionItem: { select: { inspectionId: true; room: true; item: true } };
  };
}>;

/** The most useful "linked to" labels + admin links for a document. */
function linkedTo(doc: VaultDocument): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (doc.workOrder) {
    links.push({ label: `Work order #${doc.workOrder.number}`, href: `/admin/work-orders/${doc.workOrder.id}` });
  }
  if (doc.inspectionItem) {
    links.push({
      label: `Inspection — ${doc.inspectionItem.room}: ${doc.inspectionItem.item}`,
      href: `/admin/inspections/${doc.inspectionItem.inspectionId}`,
    });
  }
  if (doc.lease) {
    const u = doc.lease.tenancy.unit;
    links.push({ label: `Lease — ${u.property.name} #${u.unitNumber}`, href: `/admin/leases/${doc.lease.id}` });
  }
  if (doc.application) {
    links.push({
      label: `Application — ${doc.application.firstName} ${doc.application.lastName}`,
      href: `/admin/applications/${doc.application.id}`,
    });
  }
  if (doc.tenancy) {
    const u = doc.tenancy.unit;
    links.push({ label: `Tenancy — ${u.property.name} #${u.unitNumber}`, href: `/admin/tenancies/${doc.tenancy.id}` });
  }
  if (doc.unit) {
    links.push({
      label: `Unit — ${doc.unit.property.name} #${doc.unit.unitNumber}`,
      href: `/admin/properties/${doc.unit.propertyId}/units/${doc.unit.id}`,
    });
  }
  if (doc.property) {
    links.push({ label: `Property — ${doc.property.name}`, href: `/admin/properties/${doc.property.id}` });
  }
  return links;
}

export default async function DocumentVaultPage({
  searchParams,
}: {
  searchParams: {
    category?: string;
    property?: string;
    q?: string;
    notice?: string;
    error?: string;
  };
}) {
  await requireLandlord();

  const categoryFilter = ALL_CATEGORIES.find((c) => c === searchParams.category);
  const propertyFilter = searchParams.property || undefined;
  const q = (searchParams.q ?? '').trim();

  const where: Prisma.DocumentWhereInput = {
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(q ? { filename: { contains: q, mode: 'insensitive' } } : {}),
    ...(propertyFilter
      ? {
          OR: [
            { propertyId: propertyFilter },
            { unit: { propertyId: propertyFilter } },
            { tenancy: { unit: { propertyId: propertyFilter } } },
            { lease: { tenancy: { unit: { propertyId: propertyFilter } } } },
            { workOrder: { unit: { propertyId: propertyFilter } } },
          ],
        }
      : {}),
  };

  const [documents, properties, tenancies, units] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        application: { select: { id: true, firstName: true, lastName: true } },
        tenancy: {
          select: {
            id: true,
            unit: { select: { unitNumber: true, property: { select: { name: true } } } },
          },
        },
        lease: {
          select: {
            id: true,
            tenancy: {
              select: {
                unit: { select: { unitNumber: true, property: { select: { name: true } } } },
              },
            },
          },
        },
        unit: {
          select: {
            id: true,
            propertyId: true,
            unitNumber: true,
            property: { select: { name: true } },
          },
        },
        property: { select: { id: true, name: true } },
        workOrder: { select: { id: true, number: true } },
        inspectionItem: { select: { inspectionId: true, room: true, item: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.property.findMany({ orderBy: { name: 'asc' } }),
    prisma.tenancy.findMany({
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    }),
    prisma.unit.findMany({
      include: { property: true },
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    }),
  ]);

  const filtersActive = Boolean(categoryFilter || propertyFilter || q);

  return (
    <div>
      <PageHeader
        title="Document Vault"
        description="Every stored file across applications, leases, tenancies, units, inspections, and work orders."
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <CardSection title="Add document" className="mb-6">
        {tenancies.length === 0 && units.length === 0 ? (
          <p className="text-sm text-gray-500">
            Create a property with units (or a tenancy) first, then you can file documents against
            them.
          </p>
        ) : (
          <form
            action={uploadVaultDocumentAction}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
          >
            <FormField label="Attach to" htmlFor="target" required>
              <Select id="target" name="target" required defaultValue="">
                <option value="" disabled>
                  Choose a tenancy or unit…
                </option>
                {tenancies.length > 0 && (
                  <optgroup label="Tenancies">
                    {tenancies.map((t) => (
                      <option key={t.id} value={`tenancy:${t.id}`}>
                        {t.unit.property.name} #{t.unit.unitNumber} —{' '}
                        {t.tenants.map((tt) => tt.user.name).join(', ') || 'no tenants'} (
                        {t.status.toLowerCase()})
                      </option>
                    ))}
                  </optgroup>
                )}
                {units.length > 0 && (
                  <optgroup label="Units">
                    {units.map((u) => (
                      <option key={u.id} value={`unit:${u.id}`}>
                        {u.property.name} #{u.unitNumber}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </FormField>
            <FormField label="Category" htmlFor="upload-category" required>
              <Select id="upload-category" name="category" required defaultValue="NOTICE">
                {VAULT_UPLOAD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {DOCUMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="File" htmlFor="file" required hint="PDF or image, up to 20 MB.">
              <input
                id="file"
                name="file"
                type="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
              />
            </FormField>
            <div>
              <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
            </div>
          </form>
        )}
      </CardSection>

      <Card className="mb-4">
        <form method="GET" action="/admin/documents" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-800">
              Category
            </label>
            <Select
              id="category"
              name="category"
              defaultValue={categoryFilter ?? ''}
              className="w-52"
            >
              <option value="">All categories</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="property" className="mb-1 block text-sm font-medium text-gray-800">
              Property
            </label>
            <Select
              id="property"
              name="property"
              defaultValue={propertyFilter ?? ''}
              className="w-52"
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="q" className="mb-1 block text-sm font-medium text-gray-800">
              Filename
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder="Search filenames…" className="w-56" />
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {filtersActive && (
            <ButtonLink href="/admin/documents" variant="ghost" size="sm">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents found"
          description={
            filtersActive
              ? 'Nothing matches these filters. Try clearing them.'
              : 'Uploads from applications, leases, inspections, and work orders will collect here automatically.'
          }
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>File</Th>
                <Th>Category</Th>
                <Th>Linked to</Th>
                <Th>Size</Th>
                <Th>Uploaded</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {documents.map((doc) => {
                const links = linkedTo(doc);
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <Td className="max-w-xs">
                      <DocumentLink doc={doc} className="break-all" />
                    </Td>
                    <Td>
                      <Badge tone={DOCUMENT_CATEGORY_TONES[doc.category]}>
                        {DOCUMENT_CATEGORY_LABELS[doc.category]}
                      </Badge>
                    </Td>
                    <Td>
                      {links.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {links.map((link) => (
                            <Link
                              key={link.href + link.label}
                              href={link.href}
                              className="block text-brand-700 hover:underline"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>{formatBytes(doc.sizeBytes)}</Td>
                    <Td>{fmt(doc.createdAt)}</Td>
                    <Td>
                      <form action={deleteVaultDocumentAction}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <SubmitButton variant="ghost" pendingText="Deleting…" className="!px-2 !py-1 !text-xs !text-red-600">
                          Delete
                        </SubmitButton>
                      </form>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
