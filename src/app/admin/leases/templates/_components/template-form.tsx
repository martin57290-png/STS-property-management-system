import { Card, Checkbox, FormField, Input, SubmitButton, Textarea } from '@/components/ui';
import { MergeFieldsCard } from '../../_components/merge-fields';

/** Shared create/edit template form with the merge-field reference sidebar. */
export function TemplateForm({
  action,
  template,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  template?: { id: string; name: string; body: string; isDefault: boolean };
  submitLabel: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form action={action} className="space-y-4 lg:col-span-2">
        {template && <input type="hidden" name="id" value={template.id} />}
        <Card>
          <div className="space-y-4">
            <FormField label="Template name" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                defaultValue={template?.name ?? ''}
                required
                placeholder="California Residential Lease Agreement"
              />
            </FormField>
            <FormField
              label="Template body"
              htmlFor="body"
              required
              hint="Plain text with {{merge_field}} placeholders. Blank lines separate paragraphs; ALL-CAPS lines render as bold section headings in the PDF."
            >
              <Textarea
                id="body"
                name="body"
                rows={28}
                required
                defaultValue={template?.body ?? ''}
                className="font-mono text-xs leading-relaxed"
              />
            </FormField>
            <Checkbox
              name="isDefault"
              defaultChecked={template?.isDefault ?? false}
              label={
                <span>
                  <span className="font-medium">Default template</span>
                  <span className="block text-xs text-gray-500">
                    Preselected in the new-lease wizard. Only one template can be the default —
                    saving clears the flag on any other template.
                  </span>
                </span>
              }
            />
          </div>
        </Card>
        <SubmitButton>{submitLabel}</SubmitButton>
      </form>
      <div>
        <MergeFieldsCard />
      </div>
    </div>
  );
}
