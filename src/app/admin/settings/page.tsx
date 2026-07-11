import type { Metadata } from 'next';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { centsToDollarString } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import {
  Badge,
  Card,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_STATUS_TONES,
} from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { updateSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

/** ENV-driven service wiring, shown read-only so the landlord knows what's live. */
function serviceRows(): { service: string; driver: string; live: boolean }[] {
  return [
    {
      service: 'File storage',
      driver: process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local',
      live: process.env.STORAGE_DRIVER === 's3',
    },
    {
      service: 'Payments',
      driver:
        process.env.PAYMENTS_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY
          ? 'stripe'
          : 'mock',
      live: Boolean(process.env.PAYMENTS_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY),
    },
    {
      service: 'Email',
      driver:
        process.env.EMAIL_DRIVER === 'resend' && process.env.RESEND_API_KEY ? 'resend' : 'mock',
      live: Boolean(process.env.EMAIL_DRIVER === 'resend' && process.env.RESEND_API_KEY),
    },
    {
      service: 'SMS',
      driver:
        process.env.SMS_DRIVER === 'twilio' && process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'mock',
      live: Boolean(process.env.SMS_DRIVER === 'twilio' && process.env.TWILIO_ACCOUNT_SID),
    },
  ];
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();
  const settings = await getSettings();
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business defaults, fee policy, work-order escalation, and service wiring."
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSection title="App settings">
            <form action={updateSettingsAction} className="space-y-5">
              <FormField label="Business name" htmlFor="businessName" required>
                <Input
                  id="businessName"
                  name="businessName"
                  required
                  defaultValue={settings.businessName}
                />
              </FormField>

              <FormField
                label="Application screening fee ($)"
                htmlFor="applicationFee"
                required
                hint={settings.applicationFeeCapNote}
              >
                <Input
                  id="applicationFee"
                  name="applicationFee"
                  required
                  inputMode="decimal"
                  defaultValue={centsToDollarString(settings.applicationFeeCents)}
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Default late fee ($)" htmlFor="defaultLateFee" required>
                  <Input
                    id="defaultLateFee"
                    name="defaultLateFee"
                    required
                    inputMode="decimal"
                    defaultValue={centsToDollarString(settings.defaultLateFeeCents)}
                  />
                </FormField>
                <FormField
                  label="Late fee grace period (days)"
                  htmlFor="defaultLateFeeGraceDays"
                  required
                >
                  <Input
                    id="defaultLateFeeGraceDays"
                    name="defaultLateFeeGraceDays"
                    type="number"
                    min={0}
                    required
                    defaultValue={settings.defaultLateFeeGraceDays}
                  />
                </FormField>
              </div>
              <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                California treats late fees as liquidated damages (Civ. Code § 1671): a fee is only
                enforceable if it is a reasonable estimate of your actual cost of a late payment,
                not a penalty. Keep it modest and be ready to justify the amount.
              </p>

              <fieldset className="rounded-md border border-gray-200 p-3 sm:p-4">
                <legend className="px-1 text-sm font-semibold text-gray-900">
                  Work-order visual escalation
                </legend>
                <p className="mb-3 text-xs text-gray-500">
                  Open tickets escalate in displayed severity after these many days, so nothing
                  quietly rots in the queue. Base priority in the database never changes.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    label="Routine → Urgent (days)"
                    htmlFor="escalateRoutineToUrgentDays"
                    required
                  >
                    <Input
                      id="escalateRoutineToUrgentDays"
                      name="escalateRoutineToUrgentDays"
                      type="number"
                      min={1}
                      required
                      defaultValue={settings.escalateRoutineToUrgentDays}
                    />
                  </FormField>
                  <FormField
                    label="Routine → Emergency (days)"
                    htmlFor="escalateRoutineToEmergencyDays"
                    required
                  >
                    <Input
                      id="escalateRoutineToEmergencyDays"
                      name="escalateRoutineToEmergencyDays"
                      type="number"
                      min={1}
                      required
                      defaultValue={settings.escalateRoutineToEmergencyDays}
                    />
                  </FormField>
                  <FormField
                    label="Urgent → Emergency (days)"
                    htmlFor="escalateUrgentToEmergencyDays"
                    required
                  >
                    <Input
                      id="escalateUrgentToEmergencyDays"
                      name="escalateUrgentToEmergencyDays"
                      type="number"
                      min={1}
                      required
                      defaultValue={settings.escalateUrgentToEmergencyDays}
                    />
                  </FormField>
                </div>
              </fieldset>

              <FormField
                label="Rent reminder (days before due date)"
                htmlFor="rentReminderDaysBefore"
                required
                hint="How many days before the due date tenants get their rent reminder."
              >
                <Input
                  id="rentReminderDaysBefore"
                  name="rentReminderDaysBefore"
                  type="number"
                  min={0}
                  required
                  defaultValue={settings.rentReminderDaysBefore}
                  className="max-w-[10rem]"
                />
              </FormField>

              <SubmitButton>Save settings</SubmitButton>
            </form>
          </CardSection>
        </div>

        <div>
          <CardSection title="Service configuration">
            <p className="mb-3 text-xs text-gray-500">
              Set via environment variables on the server — shown here so you know which providers
              are live and which are safe mocks.
            </p>
            <ul className="divide-y divide-gray-100">
              {serviceRows().map((row) => (
                <li key={row.service} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-gray-800">{row.service}</span>
                  <span className="flex items-center gap-2">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                      {row.driver}
                    </code>
                    {row.live ? <Badge tone="green">Live</Badge> : <Badge tone="gray">Mock</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </CardSection>
        </div>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Notification log</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            The last 50 emails and texts the system attempted, including preference-suppressed
            ones.
          </p>
        </div>
        {notifications.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              title="No notifications yet"
              description="Rent reminders, payment receipts, and status updates will be logged here as they go out."
            />
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>To</Th>
                <Th>Channel</Th>
                <Th>Event</Th>
                <Th>Subject</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
              </tr>
            </THead>
            <TBody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <Td className="break-all">{n.to}</Td>
                  <Td>{n.channel === 'EMAIL' ? 'Email' : 'SMS'}</Td>
                  <Td>{NOTIFICATION_EVENT_LABELS[n.event]}</Td>
                  <Td className="max-w-xs truncate" title={n.subject ?? undefined}>
                    {n.subject ?? '—'}
                  </Td>
                  <Td>
                    <Badge tone={NOTIFICATION_STATUS_TONES[n.status]}>{n.status}</Badge>
                    {n.error && <p className="mt-0.5 text-xs text-red-600">{n.error}</p>}
                  </Td>
                  <Td>{n.sentAt ? fmtDateTime(n.sentAt) : fmtDateTime(n.createdAt)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
