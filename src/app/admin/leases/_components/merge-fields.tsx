import { Card } from '@/components/ui';
import { LEASE_MERGE_FIELDS } from '@/lib/merge';

/** Sidebar reference of the merge fields a lease template may use. */
export function MergeFieldsCard() {
  return (
    <Card>
      <h2 className="text-base font-semibold text-gray-900">Merge fields</h2>
      <p className="mt-1 text-xs text-gray-500">
        Insert these placeholders in the template body. Unknown fields render as a visible ⚠
        marker in the generated PDF.
      </p>
      <dl className="mt-4 space-y-3">
        {LEASE_MERGE_FIELDS.map((field) => (
          <div key={field.field}>
            <dt>
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
                {'{{'}
                {field.field}
                {'}}'}
              </code>
            </dt>
            <dd className="mt-0.5 text-xs text-gray-500">{field.description}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
