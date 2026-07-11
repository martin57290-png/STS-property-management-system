import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { renderPdf, pdfHeader, pdfField } from '@/lib/pdf';
import { formatCents } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { applicantName } from './helpers';

export type ReceiptLine = { description: string; amountCents: number };

/**
 * Generate the itemized application-fee receipt PDF required by
 * CA Civ. Code § 1950.6(f), store it privately, and record a Document row.
 * Returns the storage key.
 */
export async function generateFeeReceipt(params: {
  application: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    unit: {
      unitNumber: string;
      property: { name: string; street: string; city: string; state: string; zip: string };
    };
  };
  lines: ReceiptLine[];
  totalCents: number;
  paymentRef?: string | null;
  actorId?: string | null;
}): Promise<string> {
  const { application: app, lines, totalCents, paymentRef, actorId } = params;
  const collectedAt = new Date();

  const pdf = await renderPdf((doc) => {
    pdfHeader(
      doc,
      'Application Screening Fee — Itemized Receipt',
      'Provided pursuant to California Civil Code § 1950.6',
    );

    pdfField(doc, 'Applicant', applicantName(app));
    pdfField(doc, 'Email', app.email);
    pdfField(
      doc,
      'Rental unit',
      `${app.unit.property.name}, Unit ${app.unit.unitNumber} — ${app.unit.property.street}, ${app.unit.property.city}, ${app.unit.property.state} ${app.unit.property.zip}`,
    );
    pdfField(doc, 'Date collected', fmtDateTime(collectedAt));
    if (paymentRef) pdfField(doc, 'Payment reference', paymentRef);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).text('Itemization of screening costs');
    doc.moveDown(0.4);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    for (const line of lines) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).text(line.description, left, y, {
        width: right - left - 110,
      });
      const afterDescription = doc.y;
      doc.text(formatCents(line.amountCents), right - 100, y, { width: 100, align: 'right' });
      doc.y = Math.max(afterDescription, doc.y);
      doc.x = left;
      doc.moveDown(0.3);
    }

    doc.moveDown(0.3);
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#999999')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.4);
    const totalY = doc.y;
    doc.font('Helvetica-Bold').fontSize(11).text('Total application screening fee', left, totalY);
    doc.text(formatCents(totalCents), right - 100, totalY, { width: 100, align: 'right' });

    doc.moveDown(2);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444444')
      .text(
        'California Civil Code § 1950.6 limits an application screening fee to the landlord’s actual ' +
          'out-of-pocket costs of gathering information about the applicant (such as the cost of a ' +
          'consumer credit report) plus the reasonable value of time spent obtaining and processing ' +
          'that information, not to exceed the statutory maximum as adjusted annually. This receipt ' +
          'itemizes those costs. Upon request, the applicant is entitled to a copy of any consumer ' +
          'credit report obtained.',
        doc.page.margins.left,
        doc.y,
        { width: right - left },
      )
      .fillColor('#000000');
  });

  const key = `applications/${app.id}/receipts/fee-receipt-${Date.now()}.pdf`;
  await getStorage().put(key, pdf, 'application/pdf');

  await prisma.document.create({
    data: {
      storageKey: key,
      filename: 'application-fee-receipt.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      category: 'RECEIPT',
      uploadedById: actorId ?? null,
      applicationId: app.id,
    },
  });

  return key;
}
