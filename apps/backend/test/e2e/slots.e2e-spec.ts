import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Period } from '@src/shared/domain/value-objects/period';
import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';
import { insertTestUser } from '@test/support/test-database';

/** `GET /v1/circles/slots` (COPAYNI-30) con la regla provisional fill_oldest (R2). */
describe('GET /v1/circles/slots', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  const get = (query: Record<string, string | number>) =>
    request(app.getHttpServer())
      .get('/v1/circles/slots')
      .query(query)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

  it('sin círculo abierto ofrece uno nuevo con todos los slots libres y su precio', async () => {
    const response = await get({ payoutAmount: 3_000_000, months: 10 }).expect(200);
    const startsOn = Period.fromDate(new Date(), 'America/Lima').addMonths(1).toString();

    expect(response.body.data).toMatchObject({
      circleId: null,
      startsOn,
      payout: { amount: 3_000_000, currency: 'PEN' },
      months: 10,
    });
    expect(response.body.data.slots).toHaveLength(10);
    expect(response.body.data.slots[0]).toEqual({
      position: 1,
      payoutPeriod: startsOn,
      type: 'fastest_payout',
      fee: { amount: 300_000, currency: 'PEN' },
      discount: { amount: 0, currency: 'PEN' },
      catchUp: { amount: 0, currency: 'PEN' },
      available: true,
    });
    expect(response.body.data.slots[9]).toMatchObject({
      type: 'highest_return',
      discount: { amount: 150_000, currency: 'PEN' },
    });
  });

  it('ofrece el círculo abierto más antiguo y marca sus slots ocupados', async () => {
    const dataSource = app.get(DataSource);
    const circleId = randomUUID();
    // 45.000 en 10 meses, lejos en el futuro: no se cruza con otras pruebas.
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on)
       VALUES ($1, 4500000, 'PEN', 10, '2040-01-01')`,
      [circleId],
    );
    await dataSource.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 3, 'k')`,
      [randomUUID(), circleId, await insertTestUser(dataSource)],
    );

    const response = await get({ payoutAmount: 4_500_000, months: 10 }).expect(200);
    expect(response.body.data).toMatchObject({ circleId, startsOn: '2040-01' });
    expect(
      (response.body.data.slots as { position: number; available: boolean }[])
        .filter(({ available }) => !available)
        .map(({ position }) => position),
    ).toEqual([3]);
  });

  it('con circleId de un círculo en curso ofrece su vacante con la puesta al día (COPAYNI-59)', async () => {
    const dataSource = app.get(DataSource);
    const circleId = randomUUID();
    // Empezó hace 2 meses; el turno 8 quedó vacante por una expulsión antes de cobrar.
    const current = Period.fromDate(new Date(), 'America/Lima');
    const startsOn = current.addMonths(-2);
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state, current_period)
       VALUES ($1, 3000000, 'PEN', 10, $2, 'contributing', $3)`,
      [circleId, `${startsOn.toString()}-01`, `${current.toString()}-01`],
    );
    const expelled = await insertTestUser(dataSource);
    await dataSource.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key, expelled_at)
       VALUES ($1, $2, $3, 8, 'k', now())`,
      [randomUUID(), circleId, expelled],
    );
    await dataSource.query(
      `INSERT INTO circle_expulsions
         (circle_id, user_id, position, period, expelled_on, overdue_amount, late_fee_amount,
          paid_amount, refund_amount, currency)
       VALUES ($1, $2, 8, $3, $4, 300000, 9000, 0, 0, 'PEN')`,
      [circleId, expelled, `${startsOn.toString()}-01`, `${startsOn.toString()}-20`],
    );

    const response = await get({ payoutAmount: 3_000_000, months: 10, circleId }).expect(200);
    const slots = response.body.data.slots as {
      position: number;
      available: boolean;
      catchUp: { amount: number };
    }[];
    expect(response.body.data.circleId).toBe(circleId);
    expect(slots.filter(({ available }) => available).map(({ position }) => position)).toEqual([8]);
    // Debe las cuotas base (3.000) de los meses transcurridos: 2 o 3, según el día del mes.
    expect([600_000, 900_000]).toContain(slots[7]!.catchUp.amount);

    const unknown = await get({ payoutAmount: 3_000_000, months: 10, circleId: randomUUID() });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('CIRCLE_NOT_FOUND');
  });

  it.each([
    [{ payoutAmount: 3_000_000 }, 400, 'VALIDATION_ERROR'],
    [{ payoutAmount: 3_000_000, months: 7 }, 400, 'VALIDATION_ERROR'],
    [{ payoutAmount: 3_000_000, months: 'diez' }, 400, 'VALIDATION_ERROR'],
    [{ payoutAmount: 3_000_050, months: 10 }, 422, 'PAYOUT_NOT_ALLOWED'],
  ])('rechaza %p con %i', async (query, status, code) => {
    const response = await get(query).expect(status);
    expect(response.body.error.code).toBe(code);
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer())
      .get('/v1/circles/slots')
      .query({ payoutAmount: 3_000_000, months: 10 })
      .expect(401);
  });
});
