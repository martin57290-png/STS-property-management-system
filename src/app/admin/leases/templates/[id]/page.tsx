import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Badge, PageHeader } from '@/components/ui';
import { TemplateForm } from '../_components/template-form';
import { updateTemplateAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditLeaseTemplatePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await requireLandlord();
  const template = await prisma.leaseTemplate.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leases: true } } },
  });
  if (!template) notFound();

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Edit template
            {template.isDefault && <Badge tone="green">Default</Badge>}
          </span>
        }
        description={
          template._count.leases > 0
            ? `Used by ${template._count.leases} lease${template._count.leases === 1 ? '' : 's'}. Edits only affect PDFs generated after saving.`
            : 'Not used by any lease yet.'
        }
      />
      {searchParams.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {searchParams.error}
        </div>
      )}
      <TemplateForm action={updateTemplateAction} template={template} submitLabel="Save changes" />
    </div>
  );
}
