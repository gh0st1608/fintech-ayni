import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/**
 * `GET /v1/circles/recommended` (COPAYNI-25). La base es compartida con las demás pruebas:
 * el orden y el filtro se prueban en la integración y en el caso de uso; aquí, el contrato.
 */
describe('GET /v1/circles/recommended', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
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
    const token: string = verified.body.data.accessToken;
    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'bank_transfer' })
      .expect(200);
    return token;
  }

  const recommended = (token: string) =>
    request(app.getHttpServer())
      .get('/v1/circles/recommended')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

  it('nunca recomienda un círculo donde el usuario ya es miembro y respeta el contrato', async () => {
    const ana = await signIn();
    const joined = await request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${ana}`)
      .set('Idempotency-Key', randomUUID())
      .send({ circleId: null, payoutAmount: 7_800_000, months: 6, position: 4 })
      .expect(201);

    const forAna = await recommended(ana);
    const ids = (forAna.body.data.items as { circleId: string }[]).map(({ circleId }) => circleId);
    expect(ids).not.toContain(joined.body.data.circleId);

    const forBeto = (await recommended(await signIn())).body.data.items as Record<
      string,
      unknown
    >[];
    expect(forBeto.length).toBeGreaterThan(0);
    expect(forBeto.length).toBeLessThanOrEqual(5);
    for (const item of forBeto) {
      expect(item).toEqual({
        circleId: expect.any(String),
        payout: { amount: expect.any(Number), currency: 'PEN' },
        months: expect.any(Number),
        startsOn: expect.stringMatching(/^\d{4}-\d{2}$/),
        endsOn: expect.stringMatching(/^\d{4}-\d{2}$/),
        baseInstallment: { amount: expect.any(Number), currency: 'PEN' },
        adminFee: { amount: expect.any(Number), currency: 'PEN' },
        availableSlots: expect.any(Number),
        vacancies: expect.any(Array),
      });
      expect(item.availableSlots).toBeGreaterThan(0);
    }
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/v1/circles/recommended').expect(401);
  });
});
