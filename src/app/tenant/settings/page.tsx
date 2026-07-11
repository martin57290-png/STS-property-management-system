import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_EVENT_PREFS, type PrefsMap } from '@/lib/notifications';
import {
  CardSection,
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
import { TENANT_NOTIFICATION_EVENTS } from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { updateNotificationPrefsAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Notification settings' };

export default async function TenantSettingsPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  const sessionUser = await requireTenant();
  const [user, prefRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: sessionUser.id } }),
    prisma.notificationPreference.findUnique({ where: { userId: sessionUser.id } }),
  ]);

  const stored = (prefRow?.prefs ?? {}) as PrefsMap;
  const prefs = { ...DEFAULT_EVENT_PREFS, ...stored };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notification settings"
        description="Choose how we reach you for each kind of update."
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <form action={updateNotificationPrefsAction}>
        <CardSection title="Contact details" className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" htmlFor="email" hint="Contact your landlord to change your email.">
              <Input id="email" value={sessionUser.email} disabled readOnly />
            </FormField>
            <FormField
              label="Mobile phone"
              htmlFor="phone"
              hint="Required for SMS alerts. Leave blank if you don't want texts."
            >
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={user?.phone ?? ''}
                placeholder="(555) 555-0100"
              />
            </FormField>
          </div>
        </CardSection>

        <CardSection title="What to send where" className="mb-4">
          {!user?.phone && (
            <p className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              No phone number on file — SMS choices below won't take effect until you add one
              above.
            </p>
          )}
          <Table>
            <THead>
              <tr>
                <Th>Notification</Th>
                <Th className="text-center">Email</Th>
                <Th className="text-center">SMS</Th>
              </tr>
            </THead>
            <TBody>
              {TENANT_NOTIFICATION_EVENTS.map(({ event, label, description }) => {
                const pref = prefs[event] ?? { email: true, sms: false };
                return (
                  <tr key={event}>
                    <Td>
                      <p className="font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{description}</p>
                    </Td>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        name={`pref_${event}_email`}
                        defaultChecked={pref.email}
                        aria-label={`Email notifications for ${label}`}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                      />
                    </Td>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        name={`pref_${event}_sms`}
                        defaultChecked={pref.sms}
                        aria-label={`SMS notifications for ${label}`}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                      />
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </CardSection>

        <SubmitButton>Save preferences</SubmitButton>
      </form>
    </div>
  );
}
