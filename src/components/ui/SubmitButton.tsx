'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button } from './Button';

/** Submit button for <form action={serverAction}> with a pending state. */
export function SubmitButton({
  children,
  pendingText = 'Saving…',
  variant = 'primary',
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
