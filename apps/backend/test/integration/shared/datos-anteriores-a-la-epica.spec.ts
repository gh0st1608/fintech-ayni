import { randomUUID } from 'node:crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { validateEnvironment } from '@src/config/env.validation';
import { MIGRATIONS } from '@src/shared/infrastructure/persistence/migrations';
import { ExpandCircleTurns1764936000000 } from '@src/shared/infrastructure/persistence/migrations/1764936000000-expand-circle-turns';
import { ContractCircleMonths1765022400000 } from '@src/shared/infrastructure/persistence/migrations/1765022400000-contract-circle-months';
import { dataSourceOptions } from '@src/shared/infrastructure/persistence/typeorm-options';
import { TEST_ENV } from '@test/setup-env';

/**
 * Las juntas que ya existían, antes y después de la épica (COPAYNI-122, criterio 4).
 *
 * El criterio pide comprobar **sobre datos reales** que ningún círculo existente cambió de
 * cronograma, cuota ni retención. No hay copia de producción a la que apuntar desde aquí, así
 * que esta prueba hace lo mecánico que el criterio describe, sin datos de nadie:
 *
 * 1. Devuelve el esquema al estado anterior a la épica, revirtiendo la contracción
 *    (COPAYNI-109) y la expansión (COPAYNI-107).
 * 2. Siembra juntas con la forma **exacta** que escribía el código de entonces: `months`, sin
 *    cadencia ni turno, el arranque en día 1, las cuotas identificadas por su periodo y el
 *    precio congelado en la membresía.
 * 3. Toma la huella de cada círculo: cronograma, cuotas, payouts y retención.
 * 4. Aplica la expansión y la contracción, que es lo que corre el despliegue.
 * 5. Vuelve a tomar la huella y la compara con la primera.
 *
 * Lo que **no** sustituye: los datos son los de este archivo y no los de producción. Lo que sí
 * demuestra es que las dos migraciones, con sus backfills y sus restricciones nuevas, no tocan
 * ningún importe ni ninguna fecha de una junta mensual, y que el turno que derivan coincide con
 * el ordinal del mes. Para el comportamiento del motor sobre una fila anterior está
 * `test/unit/modules/circles/monthly-regression.spec.ts`.
 *
 * Esquema propio, como las pruebas de las dos migraciones: revertir y volver a migrar toma
 * candados exclusivos sobre `circles` que bloquearían a los demás archivos de la suite.
 */
describe('Las juntas anteriores a la épica no cambian al migrar (COPAYNI-122)', () => {
  const schema = `mig_previas_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const expansion = new ExpandCircleTurns1764936000000();
  const contraction = new ContractCircleMonths1765022400000();

  let runner: QueryRunner;
  let dataSource: DataSource;

  /** `QueryRunner.query` devuelve `any`: aquí es donde las filas reciben tipo, una sola vez. */
  const rows = async <T>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
    (await runner.query(sql, parameters)) as T[];

  const newUser = async (): Promise<string> => {
    const userId = randomUUID();
    await runner.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'active')`, [
      userId,
      `${userId}@test.ayni`,
    ]);
    return userId;
  };

  /** El precio que el código anterior congelaba al unirse, con sus dos cuotas retenidas. */
  const storedPrice = (installment: number, turns: number) => ({
    currency: 'PEN',
    type: 'lowest_fees',
    fee: 0,
    discount: 0,
    adminFee: installment * turns * 0.12,
    netPayout: installment * turns - installment * 2,
    installments: Array.from({ length: turns }, () => installment),
    retention: installment * 2,
  });

  /** El mes que cae `elapsed` meses después de `startsOn`, con el día 1 que exigía el esquema. */
  const periodOf = (startsOn: string, elapsed: number): string => {
    const [year = 0, month = 1] = startsOn.split('-').map(Number);
    const total = year * 12 + (month - 1) + elapsed;
    const y = String(Math.floor(total / 12)).padStart(4, '0');
    const m = String((total % 12) + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  };

  interface LegacyCircle {
    label: string;
    payout: number;
    months: number;
    startsOn: string;
    state: 'collecting' | 'contributing' | 'finished';
    /** Turnos ya corridos; 0 en una junta que todavía no arrancó. */
    elapsed: number;
    members: number;
  }

  /**
   * Las formas que hay en producción: las tres duraciones de `CIRCLE_DURATION_OPTIONS` y los
   * tres estados en que puede estar una junta. Los montos son múltiplos del paso del slider y
   * se reparten en cuotas exactas, como exige el `CHECK` del esquema.
   */
  const CATALOG: LegacyCircle[] = [
    {
      label: '6 turnos sin arrancar',
      payout: 1_800_000,
      months: 6,
      startsOn: '2027-02-01',
      state: 'collecting',
      elapsed: 0,
      members: 2,
    },
    {
      label: '10 turnos en curso',
      payout: 3_000_000,
      months: 10,
      startsOn: '2026-11-01',
      state: 'contributing',
      elapsed: 3,
      members: 3,
    },
    {
      label: '12 turnos terminada',
      payout: 2_400_000,
      months: 12,
      startsOn: '2025-10-01',
      state: 'finished',
      elapsed: 12,
      members: 2,
    },
  ];

  /** Siembra una junta tal como la escribía el código anterior a la épica. */
  const seed = async (circle: LegacyCircle): Promise<void> => {
    const circleId = randomUUID();
    const installment = circle.payout / circle.months;
    const current =
      circle.state === 'contributing' ? periodOf(circle.startsOn, circle.elapsed - 1) : null;
    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state,
                            current_period)
       VALUES ($1, $2, 'PEN', $3, $4::date, $5, $6::date)`,
      [circleId, circle.payout, circle.months, circle.startsOn, circle.state, current],
    );

    const users: string[] = [];
    for (let position = 1; position <= circle.members; position += 1) {
      const userId = await newUser();
      users.push(userId);
      await runner.query(
        `INSERT INTO circle_memberships (circle_id, user_id, position, idempotency_key, price)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          circleId,
          userId,
          position,
          `${circleId}:${position}`,
          JSON.stringify(storedPrice(installment, circle.months)),
        ],
      );
    }

    // Las cuotas de los turnos corridos, con su vencimiento el día 5 del mes, y el payout de
    // quien cobra en cada uno de esos turnos.
    for (let turn = 1; turn <= circle.elapsed; turn += 1) {
      const period = periodOf(circle.startsOn, turn - 1);
      for (let position = 1; position <= circle.members; position += 1) {
        await runner.query(
          `INSERT INTO circle_installments
             (id, circle_id, user_id, position, period, due_on, amount, currency, status)
           VALUES ($1, $2, $3, $4, $5::date, ($5::date + INTERVAL '4 days')::date, $6, 'PEN', $7)`,
          [
            randomUUID(),
            circleId,
            users[position - 1],
            position,
            period,
            installment,
            turn === circle.elapsed && circle.state === 'contributing' ? 'pending' : 'paid',
          ],
        );
      }
      const beneficiary = ((turn - 1) % circle.members) + 1;
      await runner.query(
        `INSERT INTO circle_payouts (circle_id, period, user_id, position, amount, currency)
         VALUES ($1, $2::date, $3, $4, $5, 'PEN')`,
        [circleId, period, users[beneficiary - 1], beneficiary, circle.payout],
      );
    }
  };

  interface Fingerprint {
    circles: unknown[];
    installments: unknown[];
    payouts: unknown[];
    prices: unknown[];
  }

  /**
   * Lo que el criterio nombra: cronograma, cuota y retención de cada círculo. Se lee solo con
   * columnas que existen en los dos esquemas, para que la huella sea comparable.
   */
  const fingerprint = async (): Promise<Fingerprint> => ({
    circles: await rows(
      `SELECT payout_amount, currency, cycle_state,
              to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(current_period, 'YYYY-MM-DD') AS current_period
         FROM circles ORDER BY starts_on, payout_amount`,
    ),
    installments: await rows(
      `SELECT i.position, i.amount, i.status, i.currency,
              to_char(c.starts_on, 'YYYY-MM-DD') AS circle,
              to_char(i.period, 'YYYY-MM-DD') AS period,
              to_char(i.due_on, 'YYYY-MM-DD') AS due_on
         FROM circle_installments i JOIN circles c ON c.id = i.circle_id
        ORDER BY c.starts_on, i.period, i.position`,
    ),
    payouts: await rows(
      `SELECT p.position, p.amount, p.currency,
              to_char(c.starts_on, 'YYYY-MM-DD') AS circle,
              to_char(p.period, 'YYYY-MM-DD') AS period
         FROM circle_payouts p JOIN circles c ON c.id = p.circle_id
        ORDER BY c.starts_on, p.period`,
    ),
    prices: await rows(
      `SELECT m.position, m.price, to_char(c.starts_on, 'YYYY-MM-DD') AS circle
         FROM circle_memberships m JOIN circles c ON c.id = m.circle_id
        ORDER BY c.starts_on, m.position`,
    ),
  });

  let before: Fingerprint;
  let after: Fingerprint;

  beforeAll(async () => {
    const options = dataSourceOptions(validateEnvironment({ ...TEST_ENV }));
    // Pool de una sola conexión: este archivo trabaja entero sobre el runner.
    dataSource = new DataSource({ ...options, extra: { ...options.extra, max: 1 } });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}"`);
    for (const Migration of MIGRATIONS) await new Migration().up(runner);

    // 1. Atrás, al esquema anterior a la épica.
    await contraction.down(runner);
    await expansion.down(runner);
    // 2. Las juntas que ya existían, escritas como las escribía aquel código.
    for (const circle of CATALOG) await seed(circle);
    // 3. La huella de antes.
    before = await fingerprint();
    // 4. El despliegue de la épica, con sus dos migraciones y sus backfills.
    await expansion.up(runner);
    await contraction.up(runner);
    // 5. La huella de después.
    after = await fingerprint();
  }, 180_000);

  afterAll(async () => {
    await runner.query('SET search_path TO public');
    await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await runner.release();
    await dataSource.destroy();
  });

  it('el catálogo se sembró con la forma anterior y se migró entero', () => {
    const cuotas = CATALOG.reduce((total, c) => total + c.elapsed * c.members, 0);
    const payouts = CATALOG.reduce((total, c) => total + c.elapsed, 0);
    expect(before.circles).toHaveLength(CATALOG.length);
    expect(before.installments).toHaveLength(cuotas);
    expect(before.payouts).toHaveLength(payouts);
    expect(after.circles).toHaveLength(CATALOG.length);
    expect(after.installments).toHaveLength(cuotas);
  });

  it('ningún círculo cambió de cronograma', () => {
    // Cada cuota conserva su mes y su día de vencimiento; cada payout, su mes y su titular.
    const schedule = (f: Fingerprint) =>
      f.installments.map((row) => {
        const { circle, period, due_on: dueOn, position } = row as Record<string, unknown>;
        return { circle, period, dueOn, position };
      });
    expect(schedule(after)).toEqual(schedule(before));
    expect(after.payouts).toEqual(before.payouts);
    expect(after.circles).toEqual(before.circles);
  });

  it('ningún círculo cambió de cuota', () => {
    expect(after.installments).toEqual(before.installments);
  });

  it('ningún círculo cambió de retención', () => {
    // El precio congelado de la membresía: la retención, el payout neto y las cuotas firmadas.
    expect(after.prices).toEqual(before.prices);
    expect(after.prices.length).toBeGreaterThan(0);
  });

  it('el turno que derivan las migraciones es el ordinal del mes', async () => {
    const derived = await rows<{ turn: number; expected: number }>(
      `SELECT i.turn,
              (extract(year FROM i.period)::int - extract(year FROM c.starts_on)::int) * 12
              + (extract(month FROM i.period)::int - extract(month FROM c.starts_on)::int)
              + 1 AS expected
         FROM circle_installments i JOIN circles c ON c.id = i.circle_id`,
    );
    expect(derived).not.toHaveLength(0);
    for (const { turn, expected } of derived) expect(turn).toBe(Number(expected));

    // El número de turnos de cada junta es el de meses que tenía, y todas siguen siendo
    // mensuales: la cadencia la pone el DEFAULT de la expansión.
    const circles = await rows<{ turns: number; cadence: string }>(
      'SELECT turns, cadence FROM circles ORDER BY starts_on',
    );
    const expected = [...CATALOG]
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
      .map(({ months }) => months);
    expect(circles.map(({ turns }) => Number(turns))).toEqual(expected);
    expect(circles.map(({ cadence }) => cadence)).toEqual(expected.map(() => 'monthly'));
  });
});
