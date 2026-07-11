import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import {
  Badge,
  ButtonLink,
  CardSection,
  EmptyState,
  FormField,
  PageHeader,
  Select,
  SubmitButton,
} from '@/components/ui';
import { PAYMENT_METHOD_LABELS } from '@/lib/modules/payments/helpers';
import { Flash } from '@/lib/modules/payments/Flash';
import { cancelAutopayAction, toggleAutopayAction, upsertAutopayAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AutopayPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="Autopay" />
        <EmptyState
          title="No tenancy on file"
          description="Your account isn't linked to a rental yet. Contact your landlord if this seems wrong."
        />
      </div>
    );
  }

  const enrollment = await prisma.autopayEnrollment.findUnique({
    where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
  });

  // Default the run day to the tenancy's rent due day, clamped to 1–28 so
  // autopay never skips short months.
  const defaultDay = enrollment?.dayOfMonth ?? Math.min(Math.max(tenancy.rentDueDay, 1), 28);
  const defaultMethod = enrollment?.method ?? 'ACH';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Autopay"
        description="Automatic rent payments, so you never miss a due date."
        actions={
          <ButtonLink variant="secondary" size="sm" href="/tenant/payments">
            Back to payments
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {enrollment && (
        <CardSection title="Current enrollment" className="mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
            <Badge tone={enrollment.active ? 'green' : 'yellow'}>
              {enrollment.active ? 'Active' : 'Paused'}
            </Badge>
            <span>
              Runs on day {enrollment.dayOfMonth} of each month via{' '}
              {PAYMENT_METHOD_LABELS[enrollment.method]}.
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={toggleAutopayAction}>
              <SubmitButton variant="secondary" pendingText="Saving…">
                {enrollment.active ? 'Pause autopay' : 'Resume autopay'}
              </SubmitButton>
            </form>
            <form action={cancelAutopayAction}>
              <SubmitButton variant="danger" pendingText="Cancelling…">
                Cancel autopay
              </SubmitButton>
            </form>
          </div>
        </CardSection>
      )}

      <CardSection title={enrollment ? 'Change day or method' : 'Enroll in autopay'}>
        <p className="mb-4 text-sm text-gray-600">
          On your chosen day each month, autopay charges your{' '}
          <span className="font-medium">full outstanding balance</span> — typically your monthly
          rent of {formatCents(tenancy.rentCents)}, plus any other open charges. If your balance is
          zero, nothing is charged.
        </p>
        <form action={upsertAutopayAction} className="space-y-4">
          <FormField
            label="Day of month to run"
            htmlFor="autopay-day"
            required
            hint={`Your rent is due on day ${tenancy.rentDueDay}. Days 1–28 only, so autopay works in every month.`}
          >
            <Select id="autopay-day" name="dayOfMonth" defaultValue={String(defaultDay)} className="max-w-xs">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  Day {day}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Payment method"
            htmlFor="autopay-method"
            required
            hint="Bank account (ACH) is preferred — no card fees. ACH takes 3–5 business days to clear."
          >
            <Select id="autopay-method" name="method" defaultValue={defaultMethod} className="max-w-xs">
              <option value="ACH">Bank account (ACH) — preferred, no card fees</option>
              <option value="CARD">Card</option>
            </Select>
          </FormField>

          <SubmitButton pendingText="Saving…">
            {enrollment ? 'Save changes' : 'Turn on autopay'}
          </SubmitButton>
        </form>
      </CardSection>
    </div>
  );
}
