import {
  type PaymentsQueryPort,
  type TransactionDetail,
} from '@src/modules/circles/application/ports/payments-query.port';
import { GetTransactionUseCase } from '@src/modules/circles/application/use-cases/get-transaction.use-case';
import {
  GetTransactionReceiptUseCase,
  type ReceiptDocument,
} from '@src/modules/circles/application/use-cases/transaction-receipt.use-case';
import { PdfReceiptRenderer } from '@src/modules/circles/infrastructure/pdf-receipt-renderer';
import {
  cardLabel,
  yapeLabel,
} from '@src/modules/payments/application/ports/payment-method-log.port';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { SimplePdf } from '@src/shared/infrastructure/pdf/simple-pdf';
import { TestClock } from '@test/support/create-test-app';

const textOf = (pdf: Buffer): string =>
  (pdf.toString('latin1').match(/<([0-9a-f]+)> Tj/g) ?? [])
    .map((match) => Buffer.from(match.slice(1, match.indexOf('>')), 'hex').toString('latin1'))
    .join('\n');

describe('SimplePdf', () => {
  it('arma un PDF válido: tabla xref con los desplazamientos reales de cada objeto', () => {
    const pdf = new SimplePdf('Título').text(10, 10, 'Año ¿qué? • (x)').line(0, 0, 10, 10).build();
    const raw = pdf.toString('latin1');
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)/.exec(raw)![1]);
    expect(raw.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...raw.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((offset, index) => {
      expect(raw.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    // WinAnsi: tildes, ñ, ¿ y "•" (0x95) se conservan; los paréntesis no rompen la cadena.
    expect(textOf(pdf)).toBe('Año ¿qué? \x95 (x)');
  });
});

describe('etiquetas del método', () => {
  it('solo la marca o Yape y 4 dígitos', () => {
    expect(cardLabel('visa', '4242')).toBe('Visa •••• 4242');
    expect(cardLabel('master', '5454')).toBe('Mastercard •••• 5454');
    expect(cardLabel('naranja', '1111')).toBe('Naranja •••• 1111');
    expect(yapeLabel('987654321')).toBe('Yape •••• 4321');
  });
});

const PAYMENT: TransactionDetail = {
  id: '6f1c2a5e-0000-4000-8000-000000000001',
  type: 'payment',
  kind: 'installment',
  circleId: 'c-1',
  period: Period.parse('2026-12'),
  amount: Money.of(100_000, 'PEN'),
  occurredAt: new Date('2026-12-01T15:00:00Z'),
  circlePayout: Money.of(600_000, 'PEN'),
  position: 3,
};

function setup(detail: TransactionDetail | null, method: string | null) {
  const query = { transactionOf: () => Promise.resolve(detail) } as unknown as PaymentsQueryPort;
  const documents: ReceiptDocument[] = [];
  const renderer = {
    render: (document: ReceiptDocument) => {
      documents.push(document);
      return new PdfReceiptRenderer().render(document);
    },
  };
  const receipt = new GetTransactionReceiptUseCase(
    new GetTransactionUseCase(query),
    { methodOf: () => Promise.resolve(method) },
    { timeZone: 'America/Lima' },
    new TestClock(new Date('2026-12-02T15:00:00Z')),
    renderer,
  );
  return { receipt, documents };
}

describe('GetTransactionReceiptUseCase', () => {
  it('arma el comprobante del pago con los datos enmascarados', async () => {
    const { receipt, documents } = setup(PAYMENT, 'Visa •••• 4242');
    const result = await receipt.execute({ userId: 'u1' }, { type: 'payment', id: PAYMENT.id });
    expect(result.filename).toBe('ayni-comprobante-6f1c2a5e.pdf');
    expect(documents[0]).toMatchObject({
      title: 'Comprobante de pago',
      amount: expect.stringMatching(/S\/\s?1,000\.00/),
    });
    expect(documents[0]!.rows).toEqual([
      ['Concepto', 'Cuota de diciembre de 2026'],
      ['Junta', expect.stringMatching(/^Pozo de S\/\s?6,000\.00 · turno 3$/)],
      ['Fecha', expect.stringContaining('2026')],
      ['Método de pago', 'Visa •••• 4242'],
      ['N.º de operación', PAYMENT.id],
    ]);
    expect(documents[0]!.footer).toContain('Generado por Ayni');
    expect(textOf(result.pdf)).toContain('Visa \x95\x95\x95\x95 4242');
  });

  it('un pozo con descuentos los muestra; sin método dice que no quedó registrado', async () => {
    const payout: TransactionDetail = {
      ...PAYMENT,
      type: 'payout',
      kind: 'payout',
      amount: Money.of(580_000, 'PEN'),
    };
    const { receipt, documents } = setup(payout, null);
    await receipt.execute({ userId: 'u1' }, { type: 'payout', id: PAYMENT.id, language: 'en' });
    expect(documents[0]!.title).toBe('Payout receipt');
    expect(documents[0]!.rows).toContainEqual([
      'Deducted from the pot',
      expect.stringMatching(/PEN\s?200\.00|S\/\s?200\.00/),
    ]);
    expect(documents[0]!.rows).toContainEqual(['Payout account', 'Not recorded']);
  });

  it('un movimiento ajeno o inexistente responde TRANSACTION_NOT_FOUND', async () => {
    await expect(
      setup(null, null).receipt.execute({ userId: 'u1' }, { type: 'payment', id: 'x' }),
    ).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
  });
});
