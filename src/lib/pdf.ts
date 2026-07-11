import PDFDocument from 'pdfkit';

export type PdfBuilder = (doc: PDFKit.PDFDocument) => void;

/**
 * Render a PDF to a Buffer using pdfkit. Callers draw the document in the
 * builder callback; fonts default to the built-in Helvetica family.
 */
export function renderPdf(
  builder: PdfBuilder,
  options: PDFKit.PDFDocumentOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      ...options,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      builder(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Standard document header used across generated PDFs. */
export function pdfHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string): void {
  doc.font('Helvetica-Bold').fontSize(16).text('STS Property Management Systems');
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(13).text(title);
  if (subtitle) {
    doc.moveDown(0.1);
    doc.font('Helvetica').fontSize(10).fillColor('#444444').text(subtitle);
    doc.fillColor('#000000');
  }
  doc.moveDown(0.5);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#999999')
    .stroke()
    .strokeColor('#000000');
  doc.moveDown(0.8);
}

/** Simple label/value row. */
export function pdfField(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.font('Helvetica-Bold').fontSize(10).text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value);
}
