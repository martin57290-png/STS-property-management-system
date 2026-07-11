import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui';
import { stepPath, type StepSlug } from '@/lib/modules/applications/steps';

/** Bottom back/next bar shared by every wizard step. */
export function StepNav({
  token,
  back,
  next,
}: {
  token: string;
  back?: StepSlug;
  /** Either a step slug (plain link) or a custom node (e.g. a submit button). */
  next?: StepSlug | ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        {back && (
          <ButtonLink href={stepPath(token, back)} variant="secondary">
            ← Back
          </ButtonLink>
        )}
      </div>
      <div>
        {typeof next === 'string' ? (
          <ButtonLink href={stepPath(token, next as StepSlug)}>Continue →</ButtonLink>
        ) : (
          next
        )}
      </div>
    </div>
  );
}
