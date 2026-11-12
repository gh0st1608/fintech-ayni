import { SimplePdf } from '../../../shared/infrastructure/pdf/simple-pdf';
import {
  type ReceiptDocument,
  type ReceiptRendererPort,
} from '../application/use-cases/transaction-receipt.use-case';

const LEFT = 56;
const RIGHT = 539;

/** Comprobante en PDF A4: marca, título, monto destacado y una fila por dato (COPAYNI-80). */
export class PdfReceiptRenderer implements ReceiptRendererPort {
  render(document: ReceiptDocument): Buffer {
    const pdf = new SimplePdf(document.title)
      .text(LEFT, 56, 'ayni', { size: 26, bold: true })
      .text(LEFT, 100, document.title, { size: 18, bold: true })
      .text(LEFT, 140, document.amountLabel, { size: 10, gray: 0.4 })
      .text(LEFT, 156, document.amount, { size: 24, bold: true })
      .line(LEFT, 200, RIGHT, 200);
    document.rows.forEach(([label, value], index) => {
      const y = 220 + index * 40;
      pdf
        .text(LEFT, y, label, { size: 10, gray: 0.4 })
        .text(LEFT, y + 14, value, { size: 12 })
        .line(LEFT, y + 34, RIGHT, y + 34, 0.9);
    });
    pdf.text(LEFT, 230 + document.rows.length * 40, document.footer, { size: 9, gray: 0.45 });
    return pdf.build();
  }
}
