'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/' })}
      className={`text-sm font-medium text-gray-500 hover:text-gray-800 ${className}`}
    >
      Sign out
    </button>
  );
}
