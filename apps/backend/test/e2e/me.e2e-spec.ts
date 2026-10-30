import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** `GET` y `PATCH /v1/me` (COPAYNI-44 y 50) con un usuario real autenticado por OTP. */
describe('/v1/me', () => {
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
      firstName: null,
      lastName: null,
      fullName: null,
      monthlyPayInLimit: null,
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

  it('GET devuelve el perfil con el límite mensual de pay-in (COPAYNI-44)', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // Sin JOIN_MONTHLY_PAYIN_LIMIT en el ambiente de pruebas: no se le restringe.
    expect(response.body.data).toMatchObject({ email, status: 'active', monthlyPayInLimit: null });
  });

  it('guarda nombre y apellido sin tocar el idioma (COPAYNI-45)', async () => {
    const response = await patch({ firstName: '  Ana  María ', lastName: 'Quispe' }).expect(200);
    expect(response.body.data).toMatchObject({
      firstName: 'Ana María',
      lastName: 'Quispe',
      fullName: 'Ana María Quispe',
      preferredLanguage: 'pt-BR',
    });
    for (const body of [{ firstName: '' }, { lastName: 'x'.repeat(81) }, { firstName: '   ' }]) {
      const rejected = await patch(body).expect(400);
      expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('cambia el email solo después de verificar el OTP enviado al nuevo (COPAYNI-45, R9)', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const newEmail = `${randomUUID()}@mail.com`;
    const started = await request(app.getHttpServer())
      .post('/v1/me/contact/start')
      .set(auth)
      .send({ identifier: newEmail, type: 'email' })
      .expect(200);
    const { challengeId } = started.body.data as { challengeId: string };
    const before = await request(app.getHttpServer()).get('/v1/me').set(auth).expect(200);
    expect(before.body.data.email).toBe(email);

    const wrong = await request(app.getHttpServer())
      .post('/v1/me/contact/verify')
      .set(auth)
      .send({ challengeId, code: '0000' })
      .expect(422);
    expect(wrong.body.error.code).toBe('OTP_INVALID');
    const verified = await request(app.getHttpServer())
      .post('/v1/me/contact/verify')
      .set(auth)
      .send({ challengeId, code: '1234' })
      .expect(200);
    expect(verified.body.data.email).toBe(newEmail);
    // El desafío ya se usó.
    await request(app.getHttpServer())
      .post('/v1/me/contact/verify')
      .set(auth)
      .send({ challengeId, code: '1234' })
      .expect(422);

    const same = await request(app.getHttpServer())
      .post('/v1/me/contact/start')
      .set(auth)
      .send({ identifier: newEmail, type: 'email' })
      .expect(400);
    expect(same.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('un email de otra cuenta responde CONTACT_TAKEN al verificar', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const other = `${randomUUID()}@mail.com`;
    await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: other, type: 'email' })
      .expect(200);
    const started = await request(app.getHttpServer())
      .post('/v1/me/contact/start')
      .set(auth)
      .send({ identifier: other, type: 'email' })
      .expect(200);
    const taken = await request(app.getHttpServer())
      .post('/v1/me/contact/verify')
      .set(auth)
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(409);
    expect(taken.body.error.code).toBe('CONTACT_TAKEN');
  });

  it('exige un access token válido', async () => {
    await patch({ preferredLanguage: 'es' }, 'otro').expect(401);
    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', 'Bearer otro')
      .expect(401);
    await request(app.getHttpServer()).post('/v1/me/contact/start').send({}).expect(401);
  });
});
