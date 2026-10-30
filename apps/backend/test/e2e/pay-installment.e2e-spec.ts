import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Period } from '@src/shared/domain/value-objects/period';
import { createTestApp } from '@test/support/create-test-app';

/** `POST /v1/me/installments/:id/pay` (COPAYNI-63) con la pasarela simulada y un usuario real. */
describe('Pagar una cuota desde la app', () => {
  let app: NestExpressApplication;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    const email = `${randomUUID()}@mail.com`;
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: email, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    token = verified.body.data.accessToken;
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    userId = me.body.data.id;
  });

  afterAll(() => app.close());

  /** Un círculo en curso este mes con una cuota pendiente del usuario. */
  async function pendingInstallment(owner = userId): Promise<string> {
    const db = app.get(DataSource);
    const circleId = randomUUID();
    const installmentId = randomUUID();
    const month = `${Period.fromDate(new Date(), 'America/Lima').toString()}-01`;
    await db.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state, current_period)
       VALUES ($1, 600000, 'PEN', 6, $2, 'contributing', $2)`,
      [circleId, month],
    );
    await db.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 6, $4)`,
      [randomUUID(), circleId, owner, `k-${circleId}`],
    );
    await db.query(
      `INSERT INTO circle_installments (id, circle_id, user_id, position, period, due_on, amount, currency, status)
       VALUES ($1, $2, $3, 6, $4, $4::date + 4, 100000, 'PEN', 'pending')`,
      [installmentId, circleId, owner, month],
    );
    return installmentId;
  }

  const pay = (id: string, body: object, key: string | null = randomUUID()) => {
    const call = request(app.getHttpServer())
      .post(`/v1/me/installments/${id}/pay`)
      .set('Authorization', `Bearer ${token}`);
    return (key ? call.set('Idempotency-Key', key) : call).send(body);
  };
  const statusOf = async (id: string) => {
    const [row] = await app
      .get(DataSource)
      .query<{ status: string }[]>('SELECT status FROM circle_installments WHERE id = $1', [id]);
    return row?.status;
  };

  it('paga con Yape: la cuota queda pagada y un reintento no cobra de nuevo', async () => {
    const id = await pendingInstallment();
    const key = randomUUID();
    const paid = await pay(id, { method: 'yape', token: 'yape-ok' }, key).expect(200);
    expect(paid.body.data).toEqual({ status: 'paid', paymentId: expect.any(String) });
    await expect(statusOf(id)).resolves.toBe('paid');

    const retry = await pay(id, { method: 'yape', token: 'yape-ok' }, key);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('INSTALLMENT_NOT_PAYABLE');
  });

  it('paga con una tarjeta guardada', async () => {
    const card = await request(app.getHttpServer())
      .post('/v1/me/cards')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ token: `tok-${randomUUID()}` })
      .expect(201);
    const id = await pendingInstallment();
    await pay(id, { method: 'card', cardId: card.body.data.id })
      .expect(200)
      .expect(({ body }) => expect(body.data.status).toBe('paid'));
    await expect(statusOf(id)).resolves.toBe('paid');
  });

  it('un pago rechazado no cambia la cuota', async () => {
    const id = await pendingInstallment();
    const rejected = await pay(id, { method: 'yape', token: 'rejected-yape' }).expect(422);
    expect(rejected.body.error.code).toBe('PAYMENT_REJECTED');
    await expect(statusOf(id)).resolves.toBe('pending');
  });

  it('una cuota ajena o inexistente no se encuentra; el cuerpo se valida', async () => {
    const other = await app
      .get(DataSource)
      .query<{ id: string }[]>(
        `INSERT INTO users (id, email, status) VALUES (gen_random_uuid(), $1, 'active') RETURNING id`,
        [`${randomUUID()}@mail.com`],
      );
    const foreign = await pendingInstallment(other[0]!.id);
    await pay(foreign, { method: 'yape', token: 't' }).expect(404);
    await pay(randomUUID(), { method: 'yape', token: 't' }).expect(404);
    for (const [body, key] of [
      [{ method: 'yape' }, randomUUID()],
      [{ method: 'card', cardId: 'x' }, randomUUID()],
      [{ method: 'efectivo' }, randomUUID()],
      [{ method: 'yape', token: 't' }, null],
    ] as const) {
      const response = await pay(foreign, body, key).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('aplica el saldo de referidos: cobra la cuota menos el descuento (COPAYNI-53)', async () => {
    const inviter = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const inviterToken = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: inviter.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const { code } = (
      await request(app.getHttpServer())
        .get('/v1/me/referral')
        .set('Authorization', `Bearer ${inviterToken}`)
        .expect(200)
    ).body.data as { code: string };
    // El código es para el primer círculo: el usuario de las otras pruebas ya tiene cuotas.
    const fresh = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const freshToken = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: fresh.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const freshId = (
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200)
    ).body.data.id as string;
    await request(app.getHttpServer())
      .post('/v1/me/referral/claim')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ code })
      .expect(200);

    const id = await pendingInstallment(freshId);
    await request(app.getHttpServer())
      .post(`/v1/me/installments/${id}/pay`)
      .set('Authorization', `Bearer ${freshToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ method: 'yape', token: 'yape-ref' })
      .expect(200);
    const db = app.get(DataSource);
    const [ledger] = await db.query<{ amount: string }[]>(
      `SELECT e.amount::text AS amount FROM ledger_entries e
        WHERE e.transaction_key = $1 AND e.account = 'external'`,
      [`referral_discount:${id}`],
    );
    expect(ledger?.amount).toBe('15000');
    const summary = await request(app.getHttpServer())
      .get('/v1/me/referrals')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(200);
    expect(summary.body.data).toMatchObject({
      redeemed: { amount: 15000 },
      balance: { amount: 0 },
    });
  });

  it('el webhook sin firma válida se rechaza', async () => {
    await request(app.getHttpServer())
      .post('/v1/webhooks/mercadopago?data.id=1')
      .send({ type: 'payment', data: { id: '1' } })
      .expect(401);
  });
});
