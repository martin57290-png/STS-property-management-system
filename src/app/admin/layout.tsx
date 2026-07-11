import { requireLandlord } from '@/lib/auth';
import { PortalNav } from '@/components/PortalNav';
import { SignOutButton } from '@/components/SignOutButton';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/applications', label: 'Applications' },
  { href: '/admin/properties', label: 'Properties & Units' },
  { href: '/admin/tenancies', label: 'Tenancies' },
  { href: '/admin/leases', label: 'Leases' },
  { href: '/admin/inspections', label: 'Inspections' },
  { href: '/admin/payments', label: 'Rent & Payments' },
  { href: '/admin/work-orders', label: 'Work Orders' },
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/documents', label: 'Document Vault' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLandlord();
  return (
    <div className="lg:flex">
      <PortalNav
        items={NAV}
        title="STS Admin"
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
