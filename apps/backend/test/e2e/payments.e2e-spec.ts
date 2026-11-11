import './support/high-rate-limit';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

/** Sección Payment (COPAYNI-35, 36 y 41): el contrato; los montos se prueban en el caso de uso. */
describe('Sección Payment', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('un usuario sin círculos no tiene pagos pendientes', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me/payments/summary')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(200);
    expect(response.body.data).toEqual({
      hasDuePayments: false,
      totalDue: null,
      nextDueOn: null,
      debt: null,
      duePayments: [],
    });
  });

  it('el historial de un usuario sin movimientos viene vacío (COPAYNI-41)', async () => {
    for (const type of ['payment', 'payout']) {
      const response = await request(app.getHttpServer())
        .get('/v1/me/transactions')
        .query({ type })
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(200);
      expect(response.body.data).toEqual({ items: [], nextCursor: null });
    }
  });

  it.each([{}, { type: 'otro' }, { type: 'payment', limit: 51 }, { type: 'payment', cursor: 'x' }])(
    'el historial rechaza %p con VALIDATION_ERROR',
    async (query) => {
      const response = await request(app.getHttpServer())
        .get('/v1/me/transactions')
        .query(query)
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('el detalle de un movimiento ajeno o inexistente es TRANSACTION_NOT_FOUND (COPAYNI-78)', async () => {
    const detail = (id: string, query: Record<string, string>) =>
      request(app.getHttpServer())
        .get(`/v1/me/transactions/${id}`)
        .query(query)
        .set('Authorization', `Bearer ${VALID_TOKEN}`);
    const missing = await detail('3f8a1c52-7d1e-4b8a-9f2c-0e6d5b4a3c21', { type: 'payout' }).expect(
      404,
    );
    expect(missing.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    await detail('no-es-uuid', { type: 'payment' }).expect(404);
    const invalid = await detail('3f8a1c52-7d1e-4b8a-9f2c-0e6d5b4a3c21', {}).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('la elegibilidad del payout lista el checklist (COPAYNI-36)', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me/payout-eligibility')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(200);
    expect(response.body.data.isEligible).toBe(false);
    expect(
      (response.body.data.requirements as { requirement: string }[]).map((r) => r.requirement),
    ).toEqual(['national_id', 'insurance_note', 'payout_method', 'contract', 'due_payments']);
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/payments/summary').expect(401);
    await request(app.getHttpServer()).get('/v1/me/transactions?type=payment').expect(401);
    await request(app.getHttpServer()).get('/v1/me/payout-eligibility').expect(401);
  });
});
