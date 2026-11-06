import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, TestClock } from '@test/support/create-test-app';

/** `/v1/me/passcode` (COPAYNI-23) con un usuario real autenticado por OTP. */
describe('/v1/me/passcode', () => {
  let app: NestExpressApplication;
  const clock = new TestClock();

  beforeAll(async () => {
    app = await createTestApp({ verifier: null, clock });
  });

  afterAll(() => app.close());

  async function signIn(): Promise<string> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    return verified.body.data.accessToken as string;
  }

  const authed = (token: string) => ({
    status: () =>
      request(app.getHttpServer()).get('/v1/me/passcode').set('Authorization', `Bearer ${token}`),
    set: (body: object) =>
      request(app.getHttpServer())
        .put('/v1/me/passcode')
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    verify: (passcode: string) =>
      request(app.getHttpServer())
        .post('/v1/me/passcode/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ passcode }),
  });

  it('crea el passcode sin pedir uno actual y lo verifica', async () => {
    const api = authed(await signIn());
    await expect(api.status().expect(200)).resolves.toMatchObject({
      body: { data: { configured: false } },
    });
    await api.set({ newPasscode: '123456' }).expect(204);
    await expect(api.status().expect(200)).resolves.toMatchObject({
      body: { data: { configured: true } },
    });
    await api.verify('123456').expect(204);
  });

  it('cambiarlo exige el actual', async () => {
    const api = authed(await signIn());
    await api.set({ newPasscode: '123456' }).expect(204);

    const withoutCurrent = await api.set({ newPasscode: '654321' }).expect(422);
    expect(withoutCurrent.body.error.code).toBe('PASSCODE_INVALID');
    await api.set({ currentPasscode: '000000', newPasscode: '654321' }).expect(422);

    await api.set({ currentPasscode: '123456', newPasscode: '654321' }).expect(204);
    await api.verify('654321').expect(204);
    await api.verify('123456').expect(422);
  });

  it('informa los intentos restantes y bloquea al agotarlos', async () => {
    const api = authed(await signIn());
    await api.set({ newPasscode: '123456' }).expect(204);

    for (const remaining of ['4', '3', '2', '1', '0']) {
      const response = await api.verify('000000').expect(422);
      expect(response.body.error.details.attemptsRemaining).toBe(remaining);
    }

    const locked = await api.verify('123456').expect(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    clock.advanceSeconds(15 * 60 + 1);
    await api.verify('123456').expect(204);
  });

  it('un acierto reinicia los fallos', async () => {
    const api = authed(await signIn());
    await api.set({ newPasscode: '123456' }).expect(204);
    await api.verify('000000').expect(422);
    await api.verify('123456').expect(204);
    const response = await api.verify('000000').expect(422);
    expect(response.body.error.details.attemptsRemaining).toBe('4');
  });

  it('sin passcode no hay nada que verificar', async () => {
    const response = await authed(await signIn())
      .verify('123456')
      .expect(422);
    expect(response.body.error.code).toBe('PASSCODE_NOT_SET');
  });

  it.each(['12345', '1234567', 'abcdef', '12 456'])(
    'rechaza el formato %j',
    async (newPasscode) => {
      await authed(await signIn())
        .set({ newPasscode })
        .expect(400);
    },
  );

  it('no expone el hash en ninguna respuesta', async () => {
    const api = authed(await signIn());
    await api.set({ newPasscode: '123456' }).expect(204);
    const response = await api.status().expect(200);
    expect(JSON.stringify(response.body)).not.toContain('scrypt');
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/passcode').expect(401);
  });
});
