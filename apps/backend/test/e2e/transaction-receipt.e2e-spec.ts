import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '@test/support/create-test-app';

/** Texto visible de un PDF generado por SimplePdf: decodifica las cadenas hexadecimales. */
function pdfText(pdf: Buffer): string {
  const matches = pdf.toString('latin1').match(/<([0-9a-f]+)> Tj/g) ?? [];
  return matches
    .map((match) => Buffer.from(match.slice(1, match.indexOf('>')), 'hex').toString('latin1'))
    .join('\n')
    .replace(/\x95/g, '•'); // "•" en WinAnsi
}

const binary = (
  response: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

/** Comprobante en PDF de un pago o cobro (COPAYNI-80). */
describe('Comprobante de un movimiento', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function member(): Promise<{ userId: string; token: string }> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const token = (
      await http()
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const me = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    return { userId: me.body.data.id as string, token };
  }

  /** Una cuota pagada con tarjeta y un pozo cobrado a una cuenta registrada. */
  async function movements(userId: string): Promise<{ installmentId: string; payoutId: string }> {
    const circleId = randomUUID();
    const installmentId = randomUUID();
    const payoutId = randomUUID();
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, '2026-11-01', 'contributing')`,
      [circleId],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, $4)`,
      [randomUUID(), circleId, userId, randomUUID()],
    );
    await database.query(
      `INSERT INTO circle_installments
         (id, circle_id, user_id, position, period, due_on, amount, currency, status, paid_at)
       VALUES ($1, $2, $3, 1, '2026-11-01', '2026-11-01', 100000, 'PEN', 'paid',
               '2026-11-01T15:00:00Z')`,
      [installmentId, circleId, userId],
    );
    await database.query(
      `INSERT INTO installment_payment_methods (installment_id, label) VALUES ($1, 'Visa •••• 4242')`,
      [installmentId],
    );
    await database.query(
      `INSERT INTO payout_accounts (id, user_id, kind, bank_code, account_type, number_encrypted,
         number_last4, holder_name, registered_by, reason, created_at)
       VALUES ($1, $2, 'bank_account', '002', 'savings', 'v1.x.y.z', '4567', 'Juana Torres',
               'staff', 'Constancia', '2026-10-01T00:00:00Z')`,
      [randomUUID(), userId],
    );
    await database.query(
      `INSERT INTO circle_payouts (id, circle_id, period, user_id, position, amount, currency,
         disbursed_at)
       VALUES ($1, $2, '2026-11-01', $3, 1, 580000, 'PEN', '2026-11-20T15:00:00Z')`,
      [payoutId, circleId, userId],
    );
    return { installmentId, payoutId };
  }

  const receipt = (token: string, id: string, query: string) =>
    http()
      .get(`/v1/me/transactions/${id}/receipt?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binary);

  it('descarga el PDF de un pago con el método enmascarado y el número de operación', async () => {
    const juana = await member();
    const { installmentId } = await movements(juana.userId);

    const response = await receipt(juana.token, installmentId, 'type=payment').expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="ayni-comprobante-${installmentId.slice(0, 8)}.pdf"`,
    );
    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    const text = pdfText(pdf);
    expect(text).toContain('Comprobante de pago');
    expect(text).toContain('Cuota de noviembre de 2026');
    expect(text).toContain('Visa •••• 4242');
    expect(text).toContain(installmentId);
    expect(text).toMatch(/S\/\s?1,000\.00/);
  });

  it('el de un cobro muestra la cuenta vigente al pagar y lo descontado, en inglés', async () => {
    const juana = await member();
    const { payoutId } = await movements(juana.userId);
    const response = await receipt(juana.token, payoutId, 'type=payout&lang=en').expect(200);
    const text = pdfText(response.body as Buffer);
    expect(text).toContain('Payout receipt');
    expect(text).toContain('BCP •••• 4567');
    expect(text).toContain('Deducted from the pot');
    expect(text).not.toContain('v1.x.y.z');
  });

  it('el de otra persona o inexistente responde 404', async () => {
    const juana = await member();
    const { installmentId } = await movements(juana.userId);
    const pedro = await member();
    await http()
      .get(`/v1/me/transactions/${installmentId}/receipt?type=payment`)
      .set('Authorization', `Bearer ${pedro.token}`)
      .expect(404);
    await http()
      .get(`/v1/me/transactions/${installmentId}/receipt?type=nada`)
      .set('Authorization', `Bearer ${juana.token}`)
      .expect(400);
  });
});
