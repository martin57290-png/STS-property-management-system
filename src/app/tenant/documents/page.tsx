import type { Metadata } from 'next';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CardSection, EmptyState, PageHeader } from '@/components/ui';
import { DocumentList } from '@/components/documents';
import {
  DOCUMENT_CATEGORY_LABELS,
  TENANT_VISIBLE_CATEGORIES,
} from '@/lib/modules/dashboard/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Documents' };

export default async function TenantDocumentsPage() {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="Documents" />
        <EmptyState
          title="No tenancy on file"
          description="Your account isn't linked to a rental yet. Contact your landlord if this seems wrong."
        />
      </div>
    );
  }

  const leases = await prisma.lease.findMany({
    where: { tenancyId: tenancy.id },
    select: { id: true },
  });
  const leaseIds = leases.map((l) => l.id);

  // Strictly scoped to this tenant's tenancy (and its leases), shareable
  // categories only — never other tenants' files or internal records.
  const docs = await prisma.document.findMany({
    where: {
      category: { in: TENANT_VISIBLE_CATEGORIES },
      OR: [{ tenancyId: tenancy.id }, ...(leaseIds.length > 0 ? [{ leaseId: { in: leaseIds } }] : [])],
    },
    orderBy: { createdAt: 'desc' },
  });

  const byCategory = TENANT_VISIBLE_CATEGORIES.map((category) => ({
    category,
    docs: docs.filter((d) => d.category === category),
  })).filter((group) => group.docs.length > 0);

  return (
    <div>
      <PageHeader
        title="Documents"
        description={`Your lease, disclosures, notices, and receipts for ${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}.`}
      />

      {docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Your lease and any notices or receipts your landlord shares will appear here."
        />
      ) : (
        <div className="space-y-4">
          {byCategory.map((group) => (
            <CardSection key={group.category} title={DOCUMENT_CATEGORY_LABELS[group.category]}>
              <DocumentList docs={group.docs} />
            </CardSection>
          ))}
        </div>
      )}
    </div>
  );
}
