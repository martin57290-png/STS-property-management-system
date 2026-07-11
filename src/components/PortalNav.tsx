'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type NavItem = { href: string; label: string };

/**
 * Shared responsive nav: sidebar on desktop, hamburger sheet on mobile.
 * Used by both the admin and tenant portal layouts.
 */
export function PortalNav({
  items,
  title,
  footer,
}: {
  items: NavItem[];
  title: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === pathname || (href !== '/admin' && href !== '/tenant' && pathname.startsWith(href + '/')) || pathname === href;

  const links = (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={() => setOpen(false)}
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              isActive(item.href)
                ? 'bg-brand-700 text-white'
                : 'text-brand-100 hover:bg-brand-800 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-brand-900 px-4 py-3 text-white lg:hidden">
        <span className="font-bold">{title}</span>
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded p-1.5 hover:bg-brand-800"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-30 bg-brand-900 px-4 pb-6 pt-16 lg:hidden">
          <nav aria-label="Main">{links}</nav>
          {footer && <div className="mt-6 border-t border-brand-800 pt-4">{footer}</div>}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="fixed inset-y-0 flex w-60 flex-col bg-brand-900 px-3 py-5">
          <span className="mb-6 px-3 text-lg font-bold text-white">{title}</span>
          <nav aria-label="Main" className="flex-1 overflow-y-auto">
            {links}
          </nav>
          {footer && <div className="mt-4 border-t border-brand-800 px-3 pt-4">{footer}</div>}
        </div>
      </aside>
    </>
  );
}
