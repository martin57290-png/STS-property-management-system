import type { Metadata } from 'next';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import {
  ButtonLink,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Textarea,
} from '@/components/ui';
import {
  CATEGORY_LABELS,
  EMERGENCY_CATEGORY_OPTIONS,
  STANDARD_CATEGORY_OPTIONS,
  shortUnitLabel,
} from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';
import { submitWorkOrder } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New maintenance request' };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="New maintenance request" />
        <EmptyState
          title="No tenancy on file"
          description="Once your tenancy is set up, you can submit maintenance requests here."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New maintenance request"
        description={`For your home at ${shortUnitLabel(tenancy.unit)}.`}
        actions={
          <ButtonLink href="/tenant/work-orders" variant="ghost" size="sm">
            Back to requests
          </ButtonLink>
        }
      />

      <Flash error={searchParams.error} />

      <div
        className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        role="note"
      >
        If there is a fire, gas leak, or other life-threatening emergency, call 911 first.
      </div>

      <Card>
        <form action={submitWorkOrder} className="space-y-5">
          <FormField
            label="What kind of problem is it?"
            htmlFor="category"
            required
            hint="Choose an “Emergency — habitability” option if you have no heat, water, or electricity, or a sewage backup. These are treated as emergencies."
          >
            <Select id="category" name="category" required defaultValue="">
              <option value="" disabled>
                Select a category…
              </option>
              <optgroup label="Emergency — habitability">
                {EMERGENCY_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Standard">
                {STANDARD_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </optgroup>
            </Select>
          </FormField>

          <FormField label="Short title" htmlFor="title" required>
            <Input
              id="title"
              name="title"
              required
              maxLength={120}
              placeholder="e.g. Kitchen sink is leaking"
              autoComplete="off"
            />
          </FormField>

          <FormField
            label="Describe the problem"
            htmlFor="description"
            required
            hint="What is happening, where in the unit, and since when? The more detail, the faster the fix."
          >
            <Textarea id="description" name="description" required rows={5} />
          </FormField>

          <FormField
            label="Photos or videos"
            htmlFor="media"
            hint="Optional but very helpful. You can attach several photos or a short video (max 100 MB each)."
          >
            <input
              id="media"
              name="media"
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime,video/webm"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </FormField>

          <fieldset className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-800">Access to your home</legend>
            <Checkbox
              name="permissionToEnter"
              defaultChecked
              label={
                <>
                  <span className="font-medium">Permission to enter.</span>{' '}
                  <span className="text-gray-600">
                    I authorize entry to complete this repair, including when I am not home.
                  </span>
                </>
              }
            />
            <div className="mt-3">
              <FormField
                label="Preferred access times"
                htmlFor="preferredAccessTimes"
                hint="e.g. “Weekdays after 3pm” or “Any time — please text first”."
              >
                <Input
                  id="preferredAccessTimes"
                  name="preferredAccessTimes"
                  maxLength={200}
                  placeholder="Optional"
                  autoComplete="off"
                />
              </FormField>
            </div>
          </fieldset>

          <SubmitButton pendingText="Submitting…" className="w-full sm:w-auto">
            Submit request
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
