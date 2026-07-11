'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, FormField, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError('Invalid email or password.');
      return;
    }
    // Route by role: the session endpoint tells us where to go.
    const session = await fetch('/api/auth/session').then((r) => r.json());
    const role = session?.user?.role;
    const callbackUrl = searchParams.get('callbackUrl');
    if (callbackUrl && callbackUrl.startsWith('/')) {
      router.push(callbackUrl);
    } else if (role === 'LANDLORD') {
      router.push('/admin');
    } else {
      router.push('/tenant');
    }
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-xl font-bold text-brand-800">
          STS Property Management
        </h1>
        <p className="mb-6 text-center text-sm text-gray-600">Sign in to your portal</p>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-gray-600">
          Looking to rent?{' '}
          <Link href="/apply" className="font-medium text-brand-700 underline">
            Start an application
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
