import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '@test/support/create-test-app';

/** Referidos (COPAYNI-51 a 53) con usuarios reales autenticados por OTP. */
describe('Referidos', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function signIn(): Promise<{ token: string; userId: string }> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token: string = verified.body.data.accessToken;
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { token, userId: me.body.data.id };
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const claim = (token: string, code: string) =>
    request(app.getHttpServer())
      .post('/v1/me/referral/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });

  it('el invitador comparte su código y el invitado lo usa una sola vez (COPAYNI-51)', async () => {
    const inviter = await signIn();
    const mine = await get('/v1/me/referral', inviter.token).expect(200);
    const { code } = mine.body.data as { code: string };
    expect(mine.body.data).toEqual({
      code: expect.stringMatching(/^[2-9A-HJKMNP-Z]{8}$/),
      link: `ayni://invite?code=${code}`,
      reward: { amount: 15000, currency: 'PEN' },
    });
    // El mismo código en cada consulta.
    await get('/v1/me/referral', inviter.token).expect(({ body }) => {
      expect(body.data.code).toBe(code);
    });

    const invitee = await signIn();
    const claimed = await claim(invitee.token, ` ${code.toLowerCase()} `).expect(200);
    expect(claimed.body.data).toEqual({ reward: { amount: 15000, currency: 'PEN' } });
    const again = await claim(invitee.token, code).expect(409);
    expect(again.body.error.code).toBe('REFERRAL_ALREADY_CLAIMED');

    const own = await claim(inviter.token, code).expect(422);
    expect(own.body.error.code).toBe('OWN_REFERRAL_CODE');
  });

  it('rechaza un código inválido o inexistente, y a quien ya se unió a un círculo', async () => {
    const user = await signIn();
    await claim(user.token, 'no-válido')
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_ERROR'));
    await claim(user.token, '22222222')
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('REFERRAL_CODE_NOT_FOUND'));

    const inviter = await signIn();
    const { code } = (await get('/v1/me/referral', inviter.token)).body.data as { code: string };
    const db = app.get(DataSource);
    const circleId = randomUUID();
    await db.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on)
       VALUES ($1, 600000, 'PEN', 6, '2040-01-01')`,
      [circleId],
    );
    await db.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, 'k')`,
      [randomUUID(), circleId, user.userId],
    );
    await claim(user.token, code)
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('REFERRAL_NOT_ELIGIBLE'));
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/referral').expect(401);
  });
});
