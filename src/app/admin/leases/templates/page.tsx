import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import Link from 'next/link';
import { restoreDefaultTemplateAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function LeaseTemplatesPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireLandlord();
  const templates = await prisma.leaseTemplate.findMany({
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { leases: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Lease templates"
        description="Reusable lease text with merge fields. The default template is preselected when creating a new lease."
        actions={
          <>
            <form action={restoreDefaultTemplateAction}>
              <SubmitButton variant="secondary" pendingText="Restoring…">
                Restore default CA template
              </SubmitButton>
            </form>
            <ButtonLink href="/admin/leases/templates/new">New template</ButtonLink>
          </>
        }
      />

      {searchParams.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {searchParams.error}
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState
          title="No lease templates yet"
          description="Restore the built-in California residential lease template to get started, or write your own."
          action={
            <form action={restoreDefaultTemplateAction}>
              <SubmitButton pendingText="Restoring…">Restore default CA template</SubmitButton>
            </form>
          }
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Template</Th>
                <Th>Default</Th>
                <Th>Leases</Th>
                <Th>Last updated</Th>
              </tr>
            </THead>
            <TBody>
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/admin/leases/templates/${template.id}`}
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      {template.name}
                    </Link>
                  </Td>
                  <Td>{template.isDefault ? <Badge tone="green">Default</Badge> : <span className="text-gray-400">—</span>}</Td>
                  <Td>{template._count.leases}</Td>
                  <Td>{fmt(template.updatedAt)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
