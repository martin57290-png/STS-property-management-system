import { requireLandlord } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { TemplateForm } from '../_components/template-form';
import { createTemplateAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewLeaseTemplatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireLandlord();
  return (
    <div>
      <PageHeader
        title="New lease template"
        description="Write the lease text with merge fields; the sidebar lists every available field."
      />
      {searchParams.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {searchParams.error}
        </div>
      )}
      <TemplateForm action={createTemplateAction} submitLabel="Create template" />
    </div>
  );
}
