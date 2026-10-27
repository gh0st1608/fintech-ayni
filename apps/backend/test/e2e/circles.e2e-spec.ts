import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

describe('GET /v1/circles/join-config', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app.close();
  });

  it('devuelve los montos de unión según docs/api/circles.md', async () => {
    app = await createTestApp();

    const response = await request(app.getHttpServer())
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        payout: {
          min: { amount: 300000, currency: 'PEN' },
          max: { amount: 12000000, currency: 'PEN' },
          step: { amount: 50000, currency: 'PEN' },
        },
        userPayoutLimit: null,
        savingProgramMax: { amount: 100000000, currency: 'PEN' },
      },
      traceId: response.headers['x-trace-id'],
    });
  });

  it.each([
    ['sin cabecera', undefined],
    ['con un token inválido', 'Bearer otro-token'],
  ])('responde 401 %s', async (_case, authorization) => {
    app = await createTestApp();
    const call = request(app.getHttpServer()).get('/v1/circles/join-config');
    if (authorization) void call.set('Authorization', authorization);

    const response = await call.expect(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('con el verificador de producción, ningún token es válido hasta que exista auth', async () => {
    app = await createTestApp({ verifier: null });

    await request(app.getHttpServer())
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(401);
  });
});
