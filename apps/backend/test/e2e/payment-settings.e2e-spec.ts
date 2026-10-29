import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** `GET` y `PATCH /v1/me/payment-settings` (COPAYNI-38) con un usuario real. */
describe('/v1/me/payment-settings', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    token = verified.body.data.accessToken;
  });

  afterAll(() => app.close());

  const call = (method: 'get' | 'patch', body?: object) => {
    const req = request(app.getHttpServer())
      [method]('/v1/me/payment-settings')
      .set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

  it('por defecto no descuenta; el PATCH guarda la preferencia', async () => {
    await call('get')
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ deductPayInFromPayout: false }));
    await call('patch', { deductPayInFromPayout: true })
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ deductPayInFromPayout: true }));
    await call('get')
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ deductPayInFromPayout: true }));
  });

  it.each([{}, { deductPayInFromPayout: 'si' }, { deductPayInFromPayout: true, otro: 1 }])(
    'rechaza %p con VALIDATION_ERROR',
    async (body) => {
      const response = await call('patch', body).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/payment-settings').expect(401);
  });
});
