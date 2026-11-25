import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type CadenceId } from '@src/modules/circles/domain/value-objects/cadence';
import { SqlAdminCirclesQuery } from '@src/modules/circles/infrastructure/persistence/typeorm/sql-admin-circles.query';
import { SqlAdminFinanceQuery } from '@src/modules/circles/infrastructure/persistence/typeorm/sql-admin-finance.query';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

/**
 * Las lecturas del back-office por cadencia (COPAYNI-118).
 *
 * El back-office agrupa por mes. Con tres cadencias conviviendo, una vista por mes mezcla una
 * junta mensual con cuatro semanas de otra: la cifra sale sumada y la conciliación deja de cuadrar
 * a simple vista. La cadencia entra en el filtro y en el agrupamiento, y se prueba contra
 * PostgreSQL porque vive en el SQL.
 */
const MONTH = '2026-11';

describe('Back-office por cadencia sobre PostgreSQL (COPAYNI-118)', () => {
  let dataSource: DataSource;
  let circles: SqlAdminCirclesQuery;
  let finance: SqlAdminFinanceQuery;

  beforeAll(async () => {
    dataSource = await openTestDatabase([]);
    circles = new SqlAdminCirclesQuery(dataSource);
    finance = new SqlAdminFinanceQuery(dataSource);
  });

  afterAll(() => dataSource.destroy());

  /** Una junta con una cuota pagada y, si se pide, un movimiento del fondo. */
  async function circle(props: {
    cadence: CadenceId;
    startsOn: string;
    amount?: number;
    fund?: number;
  }): Promise<string> {
    const userId = await insertTestUser(dataSource);
    const circleId = randomUUID();
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, turns, cadence, starts_on, cycle_state,
                            current_period, current_turn)
       VALUES ($1, 1200000, 'PEN', 4, $2, $3::date, 'contributing',
               date_trunc('month', $3::date), 1)`,
      [circleId, props.cadence, props.startsOn],
    );
    await dataSource.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, $4)`,
      [randomUUID(), circleId, userId, `key-${circleId}`],
    );
    await dataSource.query(
      `INSERT INTO circle_installments (id, circle_id, user_id, position, turn, period, due_on,
                                        amount, currency, status, paid_at)
       VALUES ($1, $2, $3, 1, 2, date_trunc('month', $4::date), $4::date, $5, 'PEN', 'paid',
               now())`,
      [randomUUID(), circleId, userId, props.startsOn, props.amount ?? 300_000],
    );
    if (props.fund !== undefined) await fundMovement(circleId, props.fund, props.startsOn);
    return circleId;
  }

  /**
   * Un movimiento del fondo con su contrapartida: el registro contable solo acepta
   * transacciones que cuadran, así que cada entrada va con su opuesta en otra cuenta.
   */
  async function fundMovement(
    circleId: string | null,
    amount: number,
    startsOn: string | null,
  ): Promise<void> {
    const key = `fund:${randomUUID()}`;
    // Los disparadores que comprueban que el movimiento cuadra están diferidos al commit, así
    // que la transacción y sus entradas van en una sola transacción de base de datos.
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO ledger_transactions (key, kind, circle_id, period)
         VALUES ($1, 'fund_contribution', $2,
                 CASE WHEN $3::text IS NULL THEN NULL ELSE date_trunc('month', $3::date) END)`,
        [key, circleId, startsOn],
      );
      await manager.query(
        `INSERT INTO ledger_entries (id, transaction_key, account, amount, currency)
         VALUES ($1, $3, 'guarantee_fund', $5, 'PEN'), ($2, $3, 'operator', $4, 'PEN')`,
        [randomUUID(), randomUUID(), key, -amount, amount],
      );
    });
  }

  it('el listado de juntas filtra por cadencia y cada fila la trae', async () => {
    const weekly = await circle({ cadence: 'weekly', startsOn: '2026-11-04' });
    await circle({ cadence: 'monthly', startsOn: '2026-11-01' });

    const onlyWeekly = await circles.list({ cadence: 'weekly', limit: 100, cursor: null });

    expect(onlyWeekly.items.map(({ circleId }) => circleId)).toContain(weekly);
    expect(onlyWeekly.items.every((item) => item.cadence === 'weekly')).toBe(true);
    // Y la fila trae el día real del primer turno, que en semanal no es el 1.
    expect(onlyWeekly.items.find((item) => item.circleId === weekly)).toMatchObject({
      cadence: 'weekly',
      turns: 4,
      startsOn: MONTH,
      startsOnDate: '2026-11-04',
    });
  });

  it('sin filtro trae todas las cadencias, cada una con la suya', async () => {
    await circle({ cadence: 'biweekly', startsOn: '2026-11-03' });

    const all = await circles.list({ limit: 100, cursor: null });

    expect(new Set(all.items.map(({ cadence }) => cadence)).size).toBeGreaterThan(1);
  });

  it('los totales de cuotas no mezclan cadencias en una sola cifra', async () => {
    const period = '2026-12';
    await circle({ cadence: 'monthly', startsOn: '2026-12-01', amount: 500_000 });
    await circle({ cadence: 'weekly', startsOn: '2026-12-02', amount: 100_000 });
    await circle({ cadence: 'weekly', startsOn: '2026-12-09', amount: 100_000 });

    const totals = (await finance.installmentTotals(period)).filter(
      ({ status }) => status === 'paid',
    );

    // Una fila por cadencia, y cada una con su propia suma: 500.000 la mensual y 200.000 las dos
    // semanales. Sumadas serían 700.000 en «diciembre», que es la cifra que no se puede conciliar.
    expect(totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cadence: 'monthly', count: 1 }),
        expect.objectContaining({ cadence: 'weekly', count: 2 }),
      ]),
    );
    expect(totals.find(({ cadence }) => cadence === 'monthly')?.total.amount).toBe(500_000);
    expect(totals.find(({ cadence }) => cadence === 'weekly')?.total.amount).toBe(200_000);
  });

  it('el filtro de cadencia también acota los totales', async () => {
    const period = '2027-01';
    await circle({ cadence: 'monthly', startsOn: '2027-01-01', amount: 500_000 });
    await circle({ cadence: 'weekly', startsOn: '2027-01-06', amount: 100_000 });

    const totals = await finance.installmentTotals(period, 'weekly');

    expect(totals.every(({ cadence }) => cadence === 'weekly')).toBe(true);
    expect(totals.find(({ status }) => status === 'paid')?.total.amount).toBe(100_000);
  });

  it('las cuotas traen su turno y su cadencia, además del mes', async () => {
    const circleId = await circle({ cadence: 'weekly', startsOn: '2027-02-03' });

    const { items } = await finance.installments({ limit: 100, cursor: null, cadence: 'weekly' });
    const mine = items.find((item) => item.circleId === circleId);

    expect(mine).toMatchObject({ turn: 2, cadence: 'weekly', period: '2027-02' });
    // La fecha real de la cuota, que es la que identifica el turno dentro del mes.
    expect(mine?.dueOn).toBe('2027-02-03');
  });

  it('el fondo de garantía se lee por cadencia', async () => {
    await circle({ cadence: 'monthly', startsOn: '2027-03-01', fund: 40_000 });
    await circle({ cadence: 'weekly', startsOn: '2027-03-03', fund: 10_000 });
    await circle({ cadence: 'weekly', startsOn: '2027-03-10', fund: -5_000 });

    const totals = await finance.fundTotals();
    const byCadence = (cadence: CadenceId) => totals.find((total) => total.cadence === cadence);

    expect(byCadence('monthly')?.contributed.amount).toBeGreaterThanOrEqual(40_000);
    expect(byCadence('weekly')?.contributed.amount).toBeGreaterThanOrEqual(10_000);
    // El uso se lee aparte del aporte, no como un neto.
    expect(byCadence('weekly')?.used.amount).toBeGreaterThanOrEqual(5_000);
  });

  it('un movimiento manual sin junta no se reparte entre las cadencias', async () => {
    await fundMovement(null, 7_000, null);

    const totals = await finance.fundTotals();
    const manual = totals.find((total) => total.cadence === null);

    expect(manual?.contributed.amount).toBeGreaterThanOrEqual(7_000);
  });
});
