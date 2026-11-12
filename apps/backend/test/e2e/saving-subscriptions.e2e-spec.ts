import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CollectSavingContributionsUseCase } from '@src/modules/savings/application/subscription.use-cases';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { createTestApp } from '@test/support/create-test-app';

/** Suscripción al programa de ahorro y primer aporte (COPAYNI-79). */
describe('Suscripción al ahorro', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function saver(): Promise<{ token: string; cardId: string }> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const token = (
      await http()
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const card = await http()
      .post('/v1/me/cards')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ token: `tok-${randomUUID()}` })
      .expect(201);
    return { token, cardId: card.body.data.id as string };
  }

  const subscribe = (token: string, key: string, body: Record<string, unknown>) =>
    http()
      .post('/v1/savings/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);

  it('confirma, cobra el primer aporte y queda suscrita; repetir no cobra de nuevo', async () => {
    const ana = await saver();
    const key = randomUUID();
    const body = { planId: 'lite', months: 6, cardId: ana.cardId, autoDebit: true };

    const first = (await subscribe(ana.token, key, body).expect(200)).body.data;
    expect(first).toMatchObject({
      planId: 'lite',
      months: 6,
      status: 'active',
      target: { amount: 300000, currency: 'PEN' },
      cashback: { amount: 15000, currency: 'PEN' },
      saved: { amount: 50000, currency: 'PEN' },
      paidContributions: 1,
      nextContribution: { sequence: 2, amount: { amount: 50000 }, status: 'pending' },
      autoDebit: true,
      card: expect.stringMatching(/•••• \d{4}$/),
    });

    const again = (await subscribe(ana.token, key, body).expect(200)).body.data;
    expect(again.id).toBe(first.id);
    const [{ count }] = await database.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM saving_subscriptions s
         JOIN saving_subscriptions f ON f.user_id = s.user_id WHERE f.id = $1`,
      [first.id],
    );
    expect(count).toBe(1);

    const reused = await subscribe(ana.token, key, { ...body, months: 12 }).expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const mine = (
      await http().get('/v1/me/savings').set('Authorization', `Bearer ${ana.token}`).expect(200)
    ).body.data;
    expect(mine.items).toEqual([expect.objectContaining({ id: first.id, status: 'active' })]);
  });

  it('con débito automático, la tarea diaria cobra el aporte del día sin entrar a la app', async () => {
    const ana = await saver();
    const subscription = (
      await subscribe(ana.token, randomUUID(), {
        planId: 'lite',
        months: 6,
        cardId: ana.cardId,
        autoDebit: true,
      }).expect(200)
    ).body.data;
    // Se adelanta el segundo aporte a hoy para no esperar un mes.
    const today = LocalDate.fromDate(new Date(), 'America/Lima').toString();
    await database.query(
      `UPDATE saving_contributions SET due_on = $2 WHERE subscription_id = $1 AND sequence = 2`,
      [subscription.id, today],
    );

    await app.get(CollectSavingContributionsUseCase).execute();
    const mine = (
      await http().get('/v1/me/savings').set('Authorization', `Bearer ${ana.token}`).expect(200)
    ).body.data.items[0];
    expect(mine).toMatchObject({ paidContributions: 2, nextContribution: { sequence: 3 } });

    // Correr otra vez el mismo día no cobra el aporte siguiente ni repite el cobro.
    await app.get(CollectSavingContributionsUseCase).execute();
    const after = (
      await http().get('/v1/me/savings').set('Authorization', `Bearer ${ana.token}`).expect(200)
    ).body.data.items[0];
    expect(after.paidContributions).toBe(2);
  });

  it('valida la clave, el plan y la tarjeta', async () => {
    const ana = await saver();
    const body = { planId: 'lite', months: 6, cardId: ana.cardId, autoDebit: false };
    await http()
      .post('/v1/savings/subscriptions')
      .set('Authorization', `Bearer ${ana.token}`)
      .send(body)
      .expect(400);
    const plan = await subscribe(ana.token, randomUUID(), { ...body, planId: 'nada' }).expect(404);
    expect(plan.body.error.code).toBe('SAVING_PLAN_NOT_FOUND');
    const months = await subscribe(ana.token, randomUUID(), { ...body, months: 7 }).expect(400);
    expect(months.body.error.details).toEqual({ months: 'not_offered' });
    const card = await subscribe(ana.token, randomUUID(), {
      ...body,
      cardId: randomUUID(),
    }).expect(404);
    expect(card.body.error.code).toBe('CARD_NOT_FOUND');
  });
});
