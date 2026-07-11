/**
 * Server-only lease PDF generation. Loads a lease, merges the template,
 * renders a print-ready PDF, stores it privately, records a Document row,
 * and advances the lease to GENERATED.
 */
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSetting } from '@/lib/settings';
import { renderTemplate } from '@/lib/merge';
import { renderPdf, pdfHeader } from '@/lib/pdf';
import { buildStorageKey, getStorage } from '@/lib/storage';
import { fmt } from '@/lib/dates';
import { buildLeaseMergeData } from './helpers';
import { DEFAULT_CA_LEASE_TEMPLATE } from './default-template';

/** Draw merged lease text: paragraphs split on blank lines, bold headings. */
function drawLeaseBody(doc: PDFKit.PDFDocument, text: string): void {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const first = lines[0].trim();
    const isHeading = first.length > 2 && /[A-Z]/.test(first) && first === first.toUpperCase();
    if (isHeading) {
      doc.font('Helvetica-Bold').fontSize(11).text(first, { lineGap: 2 });
      const rest = lines
        .slice(1)
        .join('\n')
        .trim();
      if (rest) {
        doc.moveDown(0.15);
        doc.font('Helvetica').fontSize(11).text(rest, { lineGap: 2, align: 'left' });
      }
    } else {
      doc.font('Helvetica').fontSize(11).text(trimmed, { lineGap: 2, align: 'left' });
    }
    doc.moveDown(0.7);
  }
}

/**
 * Generate (or regenerate) the print-ready lease PDF. Returns the storage key.
 * Throws with a human-readable message on failure.
 */
export async function generateLeasePdf(
  leaseId: string,
  actorId: string | null,
): Promise<{ storageKey: string }> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      template: true,
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
    },
  });
  if (!lease) throw new Error('Lease not found.');

  const { unit } = lease.tenancy;
  const { property } = unit;
  const landlordName = await getSetting('businessName');
  const tenantNames = [...lease.tenancy.tenants]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((t) => t.user.name);
  if (tenantNames.length === 0) throw new Error('The tenancy has no tenants to name on the lease.');

  const templateBody = lease.template?.body ?? DEFAULT_CA_LEASE_TEMPLATE.body;
  const merged = renderTemplate(
    templateBody,
    buildLeaseMergeData({
      lease,
      rentDueDay: lease.tenancy.rentDueDay,
      landlordName,
      tenantNames,
      unit,
      property,
    }),
  );

  const addressLine = `${property.street}, Unit ${unit.unitNumber}, ${property.city}, ${property.state} ${property.zip}`;
  const pdf = await renderPdf((doc) => {
    pdfHeader(
      doc,
      'Residential Lease Agreement',
      `${addressLine} — term ${fmt(lease.startDate)} to ${fmt(lease.endDate)}`,
    );
    drawLeaseBody(doc, merged);
  });

  const storageKey = buildStorageKey(`leases/${lease.id}`, 'lease.pdf');
  await getStorage().put(storageKey, pdf, 'application/pdf');

  await prisma.document.create({
    data: {
      storageKey,
      filename: `lease-${unit.unitNumber}-${fmt(lease.startDate, 'yyyy-MM-dd')}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      category: 'LEASE',
      uploadedById: actorId,
      leaseId: lease.id,
      tenancyId: lease.tenancyId,
    },
  });

  await prisma.lease.update({
    where: { id: lease.id },
    data: {
      generatedPdfKey: storageKey,
      generatedAt: new Date(),
      ...(lease.status === 'DRAFT' ? { status: 'GENERATED' as const } : {}),
    },
  });

  await audit({
    actorId,
    action: 'lease.generated',
    entityType: 'Lease',
    entityId: lease.id,
    meta: { storageKey, template: lease.template?.name ?? 'built-in default' },
  });

  return { storageKey };
}
