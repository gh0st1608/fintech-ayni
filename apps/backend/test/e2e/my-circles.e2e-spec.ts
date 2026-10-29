import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { Period } from '@src/shared/domain/value-objects/period';
import { createTestApp } from '@test/support/create-test-app';

/** `GET /v1/me/circles` (COPAYNI-26) con un usuario real que se une por `POST /circles/join`. */
describe('GET /v1/me/circles', () => {
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

  const list = (token: string, query: Record<string, string | number>) =>
    request(app.getHttpServer())
      .get('/v1/me/circles')
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  // Payouts propios (en saltos de 500 y con cuotas exactas) para no cruzarse con otras pruebas.
  const join = (token: string, payoutAmount: number, position: number) =>
    request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ circleId: null, payoutAmount, months: 6, position })
      .expect(201);

  it('lista los círculos activos con el turno y el precio del usuario, paginados', async () => {
    const token = await signIn();
    await list(token, { status: 'active' })
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ items: [], nextCursor: null }));

    await join(token, 6_600_000, 2);
    const latest = await join(token, 7_200_000, 6);
    const startsOn = Period.fromDate(new Date(), 'America/Lima').addMonths(1);

    const first = await list(token, { status: 'active', limit: 1 }).expect(200);
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.items[0]).toMatchObject({
      circleId: latest.body.data.circleId,
      status: 'active',
      payout: { amount: 7_200_000, currency: 'PEN' },
      months: 6,
      startsOn: startsOn.toString(),
      endsOn: startsOn.addMonths(5).toString(),
      position: 6,
      payoutPeriod: startsOn.addMonths(5).toString(),
      type: 'highest_return',
      installments: latest.body.data.installments,
      netPayout: latest.body.data.netPayout,
    });
    expect(first.body.data.items[0].adminFee.amount).toBeGreaterThan(0);

    const second = await list(token, {
      status: 'active',
      limit: 1,
      cursor: first.body.data.nextCursor,
    }).expect(200);
    expect(second.body.data.items[0]).toMatchObject({ position: 2 });
    expect(second.body.data.nextCursor).toBeNull();

    await list(token, { status: 'finished' })
      .expect(200)
      .expect(({ body }) => expect(body.data.items).toEqual([]));
  });

  it('valida status, limit y cursor', async () => {
    const token = await signIn();
    await list(token, {}).expect(400);
    await list(token, { status: 'pending' }).expect(400);
    await list(token, { status: 'active', limit: 51 }).expect(400);
    await list(token, { status: 'active', cursor: 'inventado' })
      .expect(400)
      .expect(({ body }) => expect(body.error.details).toEqual({ cursor: 'invalid' }));
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/v1/me/circles?status=active').expect(401);
  });
});
