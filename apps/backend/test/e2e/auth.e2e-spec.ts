// Primero: sube el rate limit por IP antes de que se importe AppModule.
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, TestClock } from '@test/support/create-test-app';

const DEV_CODE = '1234';

/** Contrato de autenticación de punta a punta (docs/api/auth.md), con JWT y base reales. */
describe('Autenticación /v1/auth', () => {
  let app: NestExpressApplication;
  let clock: TestClock;

  beforeAll(async () => {
    clock = new TestClock();
    app = await createTestApp({ verifier: null, clock });
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const newEmail = () => `${randomUUID()}@mail.com`;
  const start = (identifier = newEmail(), type = 'email') =>
    http().post('/v1/auth/start').send({ identifier, type });
  const verify = (challengeId: string, code = DEV_CODE) =>
    http().post('/v1/auth/verify').send({ challengeId, code });
  const challengeIdOf = (response: request.Response): string =>
    (response.body as { data: { challengeId: string } }).data.challengeId;

  async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
    const challengeId = challengeIdOf(await start().expect(200));
    const response = await verify(challengeId).expect(200);
    return (response.body as { data: { accessToken: string; refreshToken: string } }).data;
  }

  it('start devuelve el AuthChallenge con el destino enmascarado y los plazos', async () => {
    const response = await start('Ana.Perez@Mail.com').expect(200);

    expect(response.body.data).toEqual({
      challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      channel: 'email',
      maskedDestination: 'a***@mail.com',
      expiresAt: new Date(clock.now().getTime() + 300_000).toISOString(),
      resendAvailableAt: new Date(clock.now().getTime() + 30_000).toISOString(),
    });
    const phone = await start('+51987654321', 'phone').expect(200);
    expect(phone.body.data).toMatchObject({ channel: 'sms', maskedDestination: '+51 ••• ••• 321' });
  });

  it('responde igual exista o no el usuario', async () => {
    const email = newEmail();
    const first = await start(email).expect(200);
    const second = await start(email).expect(200);
    const shape = ({ body }: request.Response) =>
      Object.keys((body as { data: object }).data).sort();
    expect(shape(first)).toEqual(shape(second));
  });

  it.each([
    [{ identifier: 'ana@', type: 'email' }, 'identifier'],
    [{ identifier: '987654321', type: 'phone' }, 'identifier'],
    [{ identifier: 'ana@mail.com', type: 'username' }, 'type'],
    [{ identifier: 'ana@mail.com' }, 'type'],
  ])('start rechaza %p con VALIDATION_ERROR', async (body, field) => {
    const response = await http().post('/v1/auth/start').send(body).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toHaveProperty(field);
  });

  it('el flujo completo: verificar, usar el access token, renovar y cerrar sesión', async () => {
    const tokens = await signIn();

    await http()
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const refreshed = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    const rotated = refreshed.body.data as { accessToken: string; refreshToken: string };
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    await http()
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200);

    await http().post('/v1/auth/logout').send({ refreshToken: rotated.refreshToken }).expect(204);
    await http().post('/v1/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
    // Idempotente: un token revocado o desconocido también responde éxito.
    await http().post('/v1/auth/logout').send({ refreshToken: rotated.refreshToken }).expect(204);
    await http().post('/v1/auth/logout').send({ refreshToken: 'desconocido' }).expect(204);
  });

  it('reutilizar un refresh token rotado revoca toda la sesión', async () => {
    const tokens = await signIn();
    const rotated = (
      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(200)
    ).body.data as { refreshToken: string };

    const reuse = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe('UNAUTHORIZED');
    // El token legítimo de la misma familia también quedó revocado.
    await http().post('/v1/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
  });

  it('un access token vencido responde 401', async () => {
    const { accessToken } = await signIn();
    clock.advanceSeconds(900 + 31);
    await http()
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('un código incorrecto informa los intentos restantes y al agotarlos lo invalida', async () => {
    const challengeId = challengeIdOf(await start().expect(200));

    const wrong = await verify(challengeId, '0000').expect(422);
    expect(wrong.body.error).toMatchObject({
      code: 'OTP_INVALID',
      details: { attemptsRemaining: '4' },
    });
    for (let attempt = 0; attempt < 3; attempt += 1) await verify(challengeId, '0000');
    const last = await verify(challengeId, '0000').expect(422);
    expect(last.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    // Ni el código correcto sirve después.
    expect((await verify(challengeId).expect(422)).body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  it('un código vencido, ya usado o de un desafío inexistente responde OTP_EXPIRED', async () => {
    const expiredId = challengeIdOf(await start().expect(200));
    clock.advanceSeconds(300);
    expect((await verify(expiredId).expect(422)).body.error.code).toBe('OTP_EXPIRED');

    const usedId = challengeIdOf(await start().expect(200));
    await verify(usedId).expect(200);
    expect((await verify(usedId).expect(422)).body.error.code).toBe('OTP_EXPIRED');

    expect((await verify(randomUUID()).expect(422)).body.error.code).toBe('OTP_EXPIRED');
    expect((await verify('ch-1').expect(422)).body.error.code).toBe('OTP_EXPIRED');
  });

  it('verify exige un código de 4 dígitos', async () => {
    const response = await verify(randomUUID(), '12a4').expect(400);
    expect(response.body.error.details).toHaveProperty('code');
  });

  it('resend respeta el plazo con Retry-After y luego reemplaza el código', async () => {
    const challengeId = challengeIdOf(await start().expect(200));

    const early = await http().post('/v1/auth/resend').send({ challengeId }).expect(429);
    expect(early.body.error.code).toBe('RATE_LIMITED');
    expect(early.headers['retry-after']).toBe('30');

    clock.advanceSeconds(30);
    const resent = await http().post('/v1/auth/resend').send({ challengeId }).expect(200);
    expect(resent.body.data).toMatchObject({ challengeId, channel: 'email' });
    await verify(challengeId).expect(200);
  });

  it('resend de un desafío inexistente responde 404', async () => {
    await http().post('/v1/auth/resend').send({ challengeId: randomUUID() }).expect(404);
  });

  it('limita los inicios por identificador con Retry-After', async () => {
    const email = newEmail();
    for (let attempt = 0; attempt < 5; attempt += 1) await start(email).expect(200);

    const limited = await start(email).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBe(900);

    clock.advanceSeconds(900);
    await start(email).expect(200);
  });
});
