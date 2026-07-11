import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { renderPdf, pdfHeader, pdfField } from '@/lib/pdf';
import { formatCents } from '@/lib/money';
import { fmt, fmtDateTime } from '@/lib/dates';
import { fullUnitAddress, photoKeyList, tenantNames } from './helpers';

const AMOUNT_COL = 100;

/**
 * Render the itemized security-deposit disposition statement PDF
 * (Civ. Code § 1950.5(g)), store it privately, and record a Document row.
 * Returns the storage key.
 */
export async function generateDispositionPdf(params: {
  tenancyId: string;
  actorId?: string | null;
}): Promise<string> {
  const disposition = await prisma.depositDisposition.findUnique({
    where: { tenancyId: params.tenancyId },
    include: {
      deductions: true,
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
    },
  });
  if (!disposition) throw new Error('Deposit disposition not found.');

  // Resolve photo-reference storage keys to their original filenames.
  const allKeys = new Set<string>();
  for (const deduction of disposition.deductions) {
    for (const key of photoKeyList(deduction.photoKeys)) allKeys.add(key);
  }
  const photoDocs = allKeys.size
    ? await prisma.document.findMany({
        where: { storageKey: { in: Array.from(allKeys) } },
        include: { inspectionItem: true },
      })
    : [];
  const photoByKey = new Map(photoDocs.map((d) => [d.storageKey, d]));

  const tenancy = disposition.tenancy;
  const totalDeductions = disposition.deductions.reduce((sum, d) => sum + d.amountCents, 0);
  const refundCents = disposition.depositCents - totalDeductions;

  const pdf = await renderPdf((doc) => {
    pdfHeader(
      doc,
      'Security Deposit Disposition — Itemized Statement',
      'Provided pursuant to California Civil Code § 1950.5(g)',
    );

    pdfField(doc, 'Tenant(s)', tenantNames(tenancy.tenants) || '—');
    pdfField(doc, 'Rental unit', fullUnitAddress(tenancy.unit));
    pdfField(doc, 'Tenancy start', fmt(tenancy.startDate));
    pdfField(
      doc,
      'Move-out date',
      disposition.moveOutDate ? fmt(disposition.moveOutDate) : '—',
    );
    if (disposition.statementDueDate) {
      pdfField(doc, 'Statement due (21 days)', fmt(disposition.statementDueDate));
    }
    pdfField(doc, 'Statement date', fmtDateTime(new Date()));
    pdfField(doc, 'Security deposit held', formatCents(disposition.depositCents));

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).text('Itemized deductions');
    doc.moveDown(0.4);

    if (disposition.deductions.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .text('No deductions — the full security deposit is being returned.');
      doc.moveDown(0.3);
    }

    for (const deduction of disposition.deductions) {
      const y = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(deduction.category, left, y, { width: right - left - AMOUNT_COL - 10 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(deduction.description, left, doc.y, { width: right - left - AMOUNT_COL - 10 });
      const afterDescription = doc.y;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(formatCents(deduction.amountCents), right - AMOUNT_COL, y, {
          width: AMOUNT_COL,
          align: 'right',
        });
      doc.y = Math.max(afterDescription, doc.y);
      doc.x = left;

      const keys = photoKeyList(deduction.photoKeys);
      if (keys.length > 0) {
        doc.fontSize(8).fillColor('#555555');
        for (const key of keys) {
          const photo = photoByKey.get(key);
          const where = photo?.inspectionItem
            ? ` (${photo.inspectionItem.room} — ${photo.inspectionItem.item})`
            : '';
          doc.text(`Photo reference: ${photo?.filename ?? key}${where}`, left + 12, doc.y, {
            width: right - left - AMOUNT_COL - 22,
          });
        }
        doc.fillColor('#000000');
        doc.x = left;
      }
      doc.moveDown(0.5);
    }

    doc.moveDown(0.3);
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#999999')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.4);

    const totalsRow = (label: string, amount: string, bold = false) => {
      const y = doc.y;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 10)
        .text(label, left, y, { width: right - left - AMOUNT_COL - 10 });
      doc.text(amount, right - AMOUNT_COL, y, { width: AMOUNT_COL, align: 'right' });
      doc.x = left;
      doc.moveDown(0.2);
    };

    totalsRow('Security deposit held', formatCents(disposition.depositCents));
    totalsRow('Total deductions withheld', formatCents(totalDeductions));
    if (refundCents >= 0) {
      totalsRow('Amount refunded to tenant', formatCents(refundCents), true);
    } else {
      totalsRow('Balance due from tenant', formatCents(Math.abs(refundCents)), true);
    }

    doc.moveDown(2);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444444')
      .text(
        'This itemized statement is furnished pursuant to California Civil Code § 1950.5(g), ' +
          'which requires a landlord to provide the tenant with an itemized statement of security ' +
          'deposit deductions, together with any remaining refund, within 21 calendar days after ' +
          'the tenant vacates the premises. Deductions are limited to unpaid rent, cleaning ' +
          'necessary to return the unit to the level of cleanliness at move-in, repair of damage ' +
          'beyond ordinary wear and tear, and other amounts authorized by the rental agreement. ' +
          'Copies of the photographs referenced above are available on request.',
        left,
        doc.y,
        { width: right - left },
      )
      .fillColor('#000000');
  });

  const key = `dispositions/${tenancy.id}/deposit-disposition-${Date.now()}.pdf`;
  await getStorage().put(key, pdf, 'application/pdf');

  await prisma.document.create({
    data: {
      storageKey: key,
      filename: 'security-deposit-disposition.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      category: 'DEPOSIT_DISPOSITION',
      uploadedById: params.actorId ?? null,
      tenancyId: tenancy.id,
    },
  });

  return key;
}
