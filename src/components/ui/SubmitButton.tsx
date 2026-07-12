'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';

/**
 * Submit button for <form action={serverAction}> with a pending state.
 * Extra button attributes (form, formAction, formNoValidate, ...) pass
 * through, so one form can host multiple submit targets.
 */
export function SubmitButton({
  children,
  pendingText = 'Saving…',
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} {...rest}>
      {pending ? pendingText : children}
    </Button>
  );
}
