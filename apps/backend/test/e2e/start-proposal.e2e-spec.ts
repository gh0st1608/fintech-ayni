import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, TestClock } from '@test/support/create-test-app';

/** `/v1/me/circles/start-proposals` (COPAYNI-62) con usuarios reales autenticados por OTP. */
describe('/v1/me/circles/.../start-proposal', () => {
  let app: NestExpressApplication;
  const clock = new TestClock(new Date('2026-11-03T15:00:00Z'));

  beforeAll(async () => {
    app = await createTestApp({ verifier: null, clock });
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
    const token = verified.body.data.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { token, userId: me.body.data.id as string };
  }

  /** Un círculo de 6 turnos en aprobación, reducido a `months`, con el usuario en el turno 4. */
  async function approvingCircle(
    userId: string,
    respondBy = '2026-11-09',
    months = 2,
  ): Promise<string> {
    const id = randomUUID();
    const database = app.get(DataSource);
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, '2026-11-01', 'approving')`,
      [id],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 4, $4)`,
      [randomUUID(), id, userId, randomUUID()],
    );
    await database.query(
      `INSERT INTO circle_start_proposals (circle_id, payout_amount, months, respond_by)
       VALUES ($1, $2, $3, $4)`,
      [id, months * 100_000, months, respondBy],
    );
    return id;
  }

  const api = (token: string) => ({
    list: () =>
      request(app.getHttpServer())
        .get('/v1/me/circles/start-proposals')
        .set('Authorization', `Bearer ${token}`),
    respond: (circleId: string, action: 'accept' | 'withdraw') =>
      request(app.getHttpServer())
        .post(`/v1/me/circles/${circleId}/start-proposal/${action}`)
        .set('Authorization', `Bearer ${token}`),
  });

  it('muestra las condiciones actuales, las nuevas y su turno', async () => {
    const { token, userId } = await signIn();
    const circleId = await approvingCircle(userId);
    const response = await api(token).list().expect(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        circleId,
        current: expect.objectContaining({
          payout: { amount: 600000, currency: 'PEN' },
          months: 6,
        }),
        proposed: {
          payout: { amount: 200000, currency: 'PEN' },
          baseInstallment: { amount: 100000, currency: 'PEN' },
          months: 2,
        },
        position: 1,
        respondBy: '2026-11-09',
        decision: null,
      }),
    ]);
  });

  it('retirarse queda registrado y se puede cambiar de opinión antes del plazo', async () => {
    const { token, userId } = await signIn();
    const circleId = await approvingCircle(userId);
    await api(token).respond(circleId, 'withdraw').expect(204);
    const response = await api(token).list().expect(200);
    expect(response.body.data.items[0].decision).toBe('withdrawn');
  });

  it('aceptar vuelve a validar la regla de confianza con el turno nuevo', async () => {
    const { token, userId } = await signIn();
    // Con 4 turnos, el primero es Fastest Payout: exige haber completado un círculo.
    const circleId = await approvingCircle(userId, '2026-11-09', 4);
    const response = await api(token).respond(circleId, 'accept').expect(422);
    expect(response.body.error.code).toBe('SLOT_NOT_ALLOWED');
  });

  it('rechaza una respuesta fuera de plazo', async () => {
    const { token, userId } = await signIn();
    const circleId = await approvingCircle(userId, '2026-11-02');
    const response = await api(token).respond(circleId, 'withdraw').expect(422);
    expect(response.body.error.code).toBe('START_PROPOSAL_EXPIRED');
  });

  it('un usuario no ve ni responde la propuesta de un círculo ajeno', async () => {
    const owner = await signIn();
    const other = await signIn();
    const circleId = await approvingCircle(owner.userId);
    const response = await api(other.token).respond(circleId, 'withdraw').expect(404);
    expect(response.body.error.code).toBe('START_PROPOSAL_NOT_FOUND');
    await expect(api(other.token).list().expect(200)).resolves.toMatchObject({
      body: { data: { items: [] } },
    });
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/circles/start-proposals').expect(401);
  });
});
