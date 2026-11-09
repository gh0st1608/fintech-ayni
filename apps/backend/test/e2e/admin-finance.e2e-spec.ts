import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Finanzas del back-office, solo lectura (docs/backoffice-plan.md, fase 3). */
describe('API del back-office: finanzas', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());
  // Un mes propio de este archivo: los totales por mes no se mezclan con otras pruebas.
  const PERIOD = `20${String(40 + Math.floor(Math.random() * 50))}-0${String(1 + Math.floor(Math.random() * 9))}`;
  let circleId: string;
  let userId: string;

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  const get = (path: string, token: string) =>
    http().get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
    circleId = randomUUID();
    userId = randomUUID();
    await database.query(
      `INSERT INTO users (id, email, status, first_name, last_name)
       VALUES ($1, $2, 'active', 'Lucía', 'Mamani')`,
      [userId, `lucia.${userId.slice(0, 8)}@mail.com`],
    );
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, $2::date, 'contributing')`,
      [circleId, `${PERIOD}-01`],
    );
    // Tres cuotas del mismo mes en distintos estados (turnos 1 a 3).
    for (const [position, status] of [
      [1, 'paid'],
      [2, 'overdue'],
      [3, 'pending'],
    ] as const) {
      await database.query(
        `INSERT INTO circle_installments (id, circle_id, user_id, position, period, due_on, amount,
                                          currency, status, paid_at)
         VALUES ($1, $2, $3, $4, $5::date, $5::date, 100000, 'PEN', $6::varchar,
                 CASE WHEN $6::varchar = 'paid' THEN now() END)`,
        [randomUUID(), circleId, userId, position, `${PERIOD}-01`, status],
      );
    }
    await database.query(
      `INSERT INTO circle_payouts (circle_id, period, user_id, position, amount, currency)
       VALUES ($1, $2::date, $3, 1, 600000, 'PEN')`,
      [circleId, `${PERIOD}-01`, userId],
    );
    // Capital semilla: la transacción y sus dos asientos, que deben cuadrar al confirmar.
    await database.transaction(async (manager) => {
      const key = `seed:${randomUUID()}`;
      await manager.query(
        `INSERT INTO ledger_transactions (key, kind, reason) VALUES ($1, 'seed_capital', 'Aporte inicial de prueba')`,
        [key],
      );
      await manager.query(
        `INSERT INTO ledger_entries (transaction_key, account, amount, currency)
         VALUES ($1, 'guarantee_fund', 50000, 'PEN'), ($1, 'external', -50000, 'PEN')`,
        [key],
      );
    });
  });

  afterAll(() => app.close());

  it('lista las cuotas del mes con totales por estado y la persona enmascarada', async () => {
    const token = await staff(['finance']);
    const response = await get(`/admin/v1/finance/installments?period=${PERIOD}`, token).expect(
      200,
    );
    const { totals, items } = response.body.data as {
      totals: { status: string; count: number; total: { amount: number } }[];
      items: { circleId: string; status: string; member: { name: string } }[];
    };
    expect(totals).toEqual(
      expect.arrayContaining([
        { status: 'paid', count: 1, total: { amount: 100000, currency: 'PEN' } },
        { status: 'overdue', count: 1, total: { amount: 100000, currency: 'PEN' } },
        { status: 'pending', count: 1, total: { amount: 100000, currency: 'PEN' } },
      ]),
    );
    expect(items.filter((item) => item.circleId === circleId)).toHaveLength(3);
    expect(items[0]?.member.name).toBe('Lucía M.');
    expect(JSON.stringify(response.body)).not.toContain('@mail.com');

    const overdue = await get(
      `/admin/v1/finance/installments?period=${PERIOD}&status=overdue`,
      token,
    ).expect(200);
    expect(overdue.body.data.items).toEqual([
      expect.objectContaining({ position: 2, status: 'overdue', paidAt: null }),
    ]);
  });

  it('pagina las cuotas sin repetir', async () => {
    const token = await staff(['super_admin']);
    const first = await get(
      `/admin/v1/finance/installments?period=${PERIOD}&limit=2`,
      token,
    ).expect(200);
    expect(first.body.data.items).toHaveLength(2);
    const second = await get(
      `/admin/v1/finance/installments?period=${PERIOD}&limit=2&cursor=${first.body.data.nextCursor as string}`,
      token,
    ).expect(200);
    const ids = [...first.body.data.items, ...second.body.data.items].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(3);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('lista los pozos entregados y el fondo con su mínimo y sus movimientos', async () => {
    const token = await staff(['finance']);
    const payouts = await get('/admin/v1/finance/payouts?limit=100', token).expect(200);
    expect(payouts.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          circleId,
          period: PERIOD,
          amount: { amount: 600000, currency: 'PEN' },
          member: { userId, name: 'Lucía M.' },
        }),
      ]),
    );

    const fund = await get('/admin/v1/finance/guarantee-fund?limit=100', token).expect(200);
    const pen = (
      fund.body.data.balances as {
        balance: { currency: string };
        minimum: { amount: number };
        activeCircles: number;
        belowMinimum: boolean;
      }[]
    ).find((balance) => balance.balance.currency === 'PEN');
    expect(pen?.activeCircles).toBeGreaterThan(0);
    expect(pen?.minimum.amount).toBeGreaterThan(0);
    expect(typeof pen?.belowMinimum).toBe('boolean');
    expect(fund.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'seed_capital',
          reason: 'Aporte inicial de prueba',
          amount: { amount: 50000, currency: 'PEN' },
        }),
      ]),
    );
  });

  it('solo finanzas y el admin general ven el dinero; valida los filtros', async () => {
    for (const role of ['support', 'operations'] as const) {
      await get('/admin/v1/finance/installments', await staff([role])).expect(403);
    }
    const token = await staff(['finance']);
    await get('/admin/v1/finance/installments?period=2026-13', token).expect(400);
    await get('/admin/v1/finance/installments?status=lost', token).expect(400);
    await get('/admin/v1/finance/payouts?cursor=basura', token).expect(400);
    await http().get('/admin/v1/finance/guarantee-fund').expect(401);
  });
});
