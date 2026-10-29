import './support/high-rate-limit';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

/** Sección Payment (COPAYNI-35 y 41): el contrato; los montos se prueban en el caso de uso. */
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

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/payments/summary').expect(401);
    await request(app.getHttpServer()).get('/v1/me/transactions?type=payment').expect(401);
  });
});
