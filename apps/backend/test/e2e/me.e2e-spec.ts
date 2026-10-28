import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** `PATCH /v1/me` (COPAYNI-50) con un usuario real autenticado por OTP. */
describe('PATCH /v1/me', () => {
  let app: NestExpressApplication;
  let accessToken: string;
  const email = `${randomUUID()}@mail.com`;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: email, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    accessToken = verified.body.data.accessToken;
  });

  afterAll(() => app.close());

  const patch = (body: object, token = accessToken) =>
    request(app.getHttpServer()).patch('/v1/me').set('Authorization', `Bearer ${token}`).send(body);

  it('guarda el idioma preferido y devuelve el perfil', async () => {
    const response = await patch({ preferredLanguage: 'en' }).expect(200);
    expect(response.body.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email,
      phone: null,
      status: 'active',
      preferredLanguage: 'en',
    });
    await expect(patch({ preferredLanguage: 'pt-BR' }).expect(200)).resolves.toMatchObject({
      body: { data: { preferredLanguage: 'pt-BR' } },
    });
  });

  it.each([{ preferredLanguage: 'EN' }, { preferredLanguage: 'english' }, {}, { other: 'es' }])(
    'rechaza %p con VALIDATION_ERROR',
    async (body) => {
      const response = await patch(body).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('exige un access token válido', async () => {
    await patch({ preferredLanguage: 'es' }, 'otro').expect(401);
  });
});
