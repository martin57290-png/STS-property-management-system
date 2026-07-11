import { requireTenant } from '@/lib/auth';
import { PortalNav } from '@/components/PortalNav';
import { SignOutButton } from '@/components/SignOutButton';

const NAV = [
  { href: '/tenant', label: 'Home' },
  { href: '/tenant/payments', label: 'Rent & Payments' },
  { href: '/tenant/work-orders', label: 'Maintenance Requests' },
  { href: '/tenant/inspections', label: 'Inspections' },
  { href: '/tenant/documents', label: 'Documents' },
  { href: '/tenant/settings', label: 'Notification Settings' },
];

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTenant();
  return (
    <div className="lg:flex">
      <PortalNav
        items={NAV}
        title="STS Resident Portal"
        footer={
          <div className="space-y-1">
            <p className="truncate text-xs text-brand-200">{user.email}</p>
            <SignOutButton className="!text-brand-100 hover:!text-white" />
          </div>
        }
      />
      <main className="min-h-screen flex-1 px-4 py-6 sm:px-6 lg:ml-60 lg:px-8">{children}</main>
    </div>
  );
}
