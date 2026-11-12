import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { createTestApp } from '@test/support/create-test-app';

const TODAY = LocalDate.fromDate(new Date(), 'America/Lima').toString();
const day = (offset: number): string => {
  const date = new Date(`${TODAY}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

/** Mora en el back-office (COPAYNI-94). */
describe('API del back-office: mora', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  /** Una junta con una cuota en gracia (Rosa) y un expulsado con deuda y devolución (Luis). */
  async function seed(): Promise<{ installmentId: string; expulsionId: string; circleId: string }> {
    const circleId = randomUUID();
    const rosa = randomUUID();
    const luis = randomUUID();
    for (const [id, name] of [
      [rosa, 'Rosa'],
      [luis, 'Luis'],
    ] as const) {
      await database.query(
        `INSERT INTO users (id, email, status, first_name, last_name)
         VALUES ($1, $2, 'active', $3, 'Quispe')`,
        [id, `${id}@mail.com`, name],
      );
    }
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, '2026-11-01', 'contributing')`,
      [circleId],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key, expelled_at)
       VALUES ($1, $2, $3, 1, $4, NULL), ($5, $2, $6, 2, $7, now())`,
      [randomUUID(), circleId, rosa, randomUUID(), randomUUID(), luis, randomUUID()],
    );
    const installmentId = randomUUID();
    await database.query(
      `INSERT INTO circle_installments (id, circle_id, user_id, position, period, due_on, amount,
         currency, status)
       VALUES ($1, $2, $3, 1, date_trunc('month', $4::date), $4::date, 100000, 'PEN', 'overdue')`,
      [installmentId, circleId, rosa, day(-1)],
    );
    const expulsionId = randomUUID();
    await database.query(
      `INSERT INTO circle_expulsions (id, circle_id, user_id, position, period, expelled_on,
         overdue_amount, late_fee_amount, refund_amount, currency)
       VALUES ($1, $2, $3, 2, date_trunc('month', $4::date), $4::date, 100000, 5000, 95000, 'PEN')`,
      [expulsionId, circleId, luis, day(0)],
    );
    return { installmentId, expulsionId, circleId };
  }

  const view = (token: string, name: string) =>
    http()
      .get(`/admin/v1/delinquency?view=${name}&limit=100`)
      .set('Authorization', `Bearer ${token}`);

  it('muestra gracia, expulsiones, deudas y devoluciones con datos enmascarados', async () => {
    const { installmentId, expulsionId, circleId } = await seed();
    const finance = await staff(['finance']);

    const grace = (await view(finance, 'grace').expect(200)).body.data;
    expect(grace.items).toContainEqual(
      expect.objectContaining({
        id: installmentId,
        circleId,
        member: expect.objectContaining({ name: 'Rosa Q.' }),
        amount: { amount: 100000, currency: 'PEN' },
        graceEndsOn: day(2),
        settledAt: null,
      }),
    );
    expect(grace.pending).toEqual([expect.objectContaining({ currency: 'PEN' })]);

    const debts = (await view(finance, 'debts').expect(200)).body.data;
    expect(debts.items).toContainEqual(
      expect.objectContaining({
        id: expulsionId,
        member: expect.objectContaining({ name: 'Luis Q.' }),
        amount: { amount: 100000, currency: 'PEN' },
        lateFee: { amount: 5000, currency: 'PEN' },
        settledAt: null,
      }),
    );
    const refunds = (await view(finance, 'refunds').expect(200)).body.data;
    expect(refunds.items).toContainEqual(
      expect.objectContaining({ id: expulsionId, amount: { amount: 95000, currency: 'PEN' } }),
    );
    const expelled = (await view(finance, 'expelled').expect(200)).body.data;
    const expelledIds = (expelled.items as { id: string }[]).map((item) => item.id);
    expect(expelledIds).toContain(expulsionId);
    expect(JSON.stringify(expelled)).not.toContain('@mail.com');
  });

  it('pagina y restringe a finanzas, operaciones y el admin general', async () => {
    await seed();
    await seed();
    const operations = await staff(['operations']);
    const first = (
      await http()
        .get('/admin/v1/delinquency?view=expelled&limit=1')
        .set('Authorization', `Bearer ${operations}`)
        .expect(200)
    ).body.data;
    expect(first.items).toHaveLength(1);
    const second = (
      await http()
        .get(`/admin/v1/delinquency?view=expelled&limit=1&cursor=${first.nextCursor as string}`)
        .set('Authorization', `Bearer ${operations}`)
        .expect(200)
    ).body.data;
    expect(second.items[0].id).not.toBe(first.items[0].id);

    const support = await staff(['support']);
    await view(support, 'grace').expect(403);
    await view(operations, 'nada').expect(400);
  });
});
