import type { NextAuthOptions, User as NextAuthUser } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<NextAuthUser | null> {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as NextAuthUser & { role: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};

export type SessionUser = { id: string; email: string; name: string; role: Role };

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role,
  };
}

/** Redirects to /login unless a landlord is signed in. */
export async function requireLandlord(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'LANDLORD') redirect('/');
  return user;
}

/** Redirects to /login unless a tenant is signed in. */
export async function requireTenant(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'TENANT') redirect('/');
  return user;
}

/** Any authenticated user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Returns the tenant's active (or most recent) tenancy, with unit+property.
 * Most tenant-portal pages scope everything to this.
 */
export async function getTenantTenancy(userId: string) {
  const include = {
    unit: { include: { property: true } },
    tenants: { include: { user: true } },
  } as const;
  const active = await prisma.tenancy.findFirst({
    where: { tenants: { some: { userId } }, status: 'ACTIVE' },
    include,
  });
  if (active) return active;
  return prisma.tenancy.findFirst({
    where: { tenants: { some: { userId } } },
    orderBy: { startDate: 'desc' },
    include,
  });
}
