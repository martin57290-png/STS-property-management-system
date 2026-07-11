import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Route-level RBAC:
 * - /admin/**  → LANDLORD only
 * - /tenant/** → TENANT only
 * Everything else (landing, /apply, /application-status, /login, API auth)
 * is public; API routes do their own session checks.
 */
export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role;
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/admin') && role !== 'LANDLORD') {
      return NextResponse.redirect(new URL(role ? '/tenant' : '/login', req.url));
    }
    if (pathname.startsWith('/tenant') && role !== 'TENANT') {
      return NextResponse.redirect(new URL(role ? '/admin' : '/login', req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: '/login' },
  },
);

export const config = {
  matcher: ['/admin/:path*', '/tenant/:path*'],
};
