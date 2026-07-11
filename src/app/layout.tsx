import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'STS Property Management Systems',
    template: '%s · STS Property Management',
  },
  description:
    'Property management for applications, leases, inspections, rent collection, and maintenance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
