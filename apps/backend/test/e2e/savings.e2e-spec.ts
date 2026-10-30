import './support/high-rate-limit';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

/** Programa de ahorro (COPAYNI-32 y 33) con el catálogo provisional por defecto. */
describe('Planes de ahorro', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${VALID_TOKEN}`);

  it('lista los planes con su cashback máximo y las duraciones', async () => {
    const response = await get('/v1/savings/plans').expect(200);
    expect(response.body.data.durations).toEqual([6, 12, 24]);
    expect(response.body.data.items[0]).toEqual({
      id: 'lite',
      target: { amount: 300000, currency: 'PEN' },
      maxCashback: { amount: 60000, currency: 'PEN' },
    });
    // SAVING_PROGRAM_MAX de pruebas (1.000.000) deja los seis planes.
    expect((response.body.data.items as { id: string }[]).map(({ id }) => id)).toEqual([
      'lite',
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
    ]);
  });

  it('cotiza un plan con una duración', async () => {
    const response = await get('/v1/savings/plans/lite/quote?months=6').expect(200);
    expect(response.body.data).toMatchObject({
      planId: 'lite',
      months: 6,
      monthlyInstallment: { amount: 50000, currency: 'PEN' },
      cashback: { amount: 15000, currency: 'PEN' },
      total: { amount: 315000, currency: 'PEN' },
      startsOn: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
    expect(response.body.data.installments).toHaveLength(6);
    expect(response.body.data.payoutPeriod > response.body.data.startsOn).toBe(true);
  });

  it.each([
    ['/v1/savings/plans/lite/quote', 400, 'VALIDATION_ERROR'],
    ['/v1/savings/plans/lite/quote?months=9', 400, 'VALIDATION_ERROR'],
    ['/v1/savings/plans/otro/quote?months=6', 404, 'SAVING_PLAN_NOT_FOUND'],
  ])('%s responde %i', async (path, status, code) => {
    const response = await get(path).expect(status);
    expect(response.body.error.code).toBe(code);
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/savings/plans').expect(401);
  });
});
