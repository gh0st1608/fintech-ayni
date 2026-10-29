import './support/high-rate-limit';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

/** Sección Payment (COPAYNI-35): el contrato; los montos se prueban en el caso de uso. */
describe('GET /v1/me/payments/summary', () => {
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

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/payments/summary').expect(401);
  });
});
