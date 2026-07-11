import { Card, FormField, Input, SubmitButton } from '@/components/ui';
import { toDateInputValue } from '@/lib/dates';
import { centsToDollarString } from '@/lib/money';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { savePersonal } from '../actions';
import { StepNav } from './step-shared';

export function PersonalStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  return (
    <form action={savePersonal.bind(null, token)}>
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" htmlFor="firstName" required>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              required
              defaultValue={app.firstName}
            />
          </FormField>
          <FormField label="Last name" htmlFor="lastName" required>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              required
              defaultValue={app.lastName}
            />
          </FormField>
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={app.email}
            />
          </FormField>
          <FormField label="Phone" htmlFor="phone" required>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              defaultValue={app.phone}
            />
          </FormField>
          <FormField label="Date of birth" htmlFor="dateOfBirth">
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              autoComplete="bday"
              defaultValue={toDateInputValue(app.dateOfBirth)}
            />
          </FormField>
          <FormField label="Desired move-in date" htmlFor="moveInDate">
            <Input
              id="moveInDate"
              name="moveInDate"
              type="date"
              defaultValue={toDateInputValue(app.moveInDate)}
            />
          </FormField>
          <FormField
            label="Total monthly income (before taxes)"
            htmlFor="monthlyIncome"
            hint="Dollars, e.g. 5,400. Include all income sources you want considered."
          >
            <Input
              id="monthlyIncome"
              name="monthlyIncome"
              inputMode="decimal"
              placeholder="$"
              defaultValue={centsToDollarString(app.monthlyIncomeCents)}
            />
          </FormField>
        </div>
      </Card>
      <StepNav token={token} next={<SubmitButton pendingText="Saving…">Save & continue →</SubmitButton>} />
    </form>
  );
}
