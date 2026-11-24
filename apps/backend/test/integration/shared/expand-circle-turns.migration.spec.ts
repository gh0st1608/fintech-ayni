import { randomUUID } from 'node:crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { validateEnvironment } from '@src/config/env.validation';
import { MIGRATIONS } from '@src/shared/infrastructure/persistence/migrations';
import { ExpandCircleTurns1764936000000 } from '@src/shared/infrastructure/persistence/migrations/1764936000000-expand-circle-turns';
import { dataSourceOptions } from '@src/shared/infrastructure/persistence/typeorm-options';
import { TEST_ENV } from '@test/setup-env';

interface CircleTurnRow {
  cadence: string;
  turns: number | null;
  current_turn: number | null;
}

/**
 * La migración de expansión del turno (COPAYNI-107) contra PostgreSQL real.
 *
 * Se prueba en un **esquema propio**, construido aquí con la cadena de migraciones **hasta la
 * expansión incluida**, y no en el `public` que comparte el resto de la suite. La cadena se corta
 * ahí porque es el estado en que esta migración se aplica de verdad; aplicando la cadena entera,
 * lo que se probaría es la expansión sobre un esquema ya contraído (COPAYNI-109), que no existe. La razón es que para probar un backfill hay
 * que volver al esquema anterior, sembrar datos mensuales y volver a expandir, y eso toma
 * candados exclusivos sobre `circles`: hacerlo en el esquema compartido bloquearía a los demás
 * archivos, que corren en paralelo. Aislado no estorba a nadie, y además prueba la cadena entera.
 */
/** La cadena hasta la expansión, que es el esquema sobre el que esta migración se aplica. */
const CHAIN_UP_TO_EXPANSION = MIGRATIONS.slice(
  0,
  MIGRATIONS.indexOf(ExpandCircleTurns1764936000000) + 1,
);

describe('Migración de expansión de turnos (COPAYNI-107)', () => {
  const schema = `mig_turnos_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const migration = new ExpandCircleTurns1764936000000();

  let runner: QueryRunner;
  let dataSource: DataSource;

  /** `QueryRunner.query` devuelve `any`: aquí es donde las filas reciben tipo, una sola vez. */
  const rows = async <T>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
    (await runner.query(sql, parameters)) as T[];

  /** Devuelve el esquema al estado anterior a la expansión. */
  const revert = (): Promise<void> => migration.down(runner);
  /** Aplica la expansión, con su backfill. */
  const expand = (): Promise<void> => migration.up(runner);

  beforeAll(async () => {
    const options = dataSourceOptions(validateEnvironment({ ...TEST_ENV }));
    // Pool de una sola conexión: este archivo trabaja entero sobre el runner, y la corrida
    // completa abre muchas a la vez contra el mismo PostgreSQL. No reservar las que no se usan.
    dataSource = new DataSource({ ...options, extra: { ...options.extra, max: 1 } });
    await dataSource.initialize();
    // `search_path` es ajuste de sesión: no vale para otra conexión del pool.
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}"`);
    for (const Migration of CHAIN_UP_TO_EXPANSION) await new Migration().up(runner);
  }, 120_000);

  afterAll(async () => {
    await runner.query('SET search_path TO public');
    await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await runner.release();
    await dataSource.destroy();
  });

  /**
   * Un círculo mensual tal como lo escribe el código anterior a la expansión: meses, mes de
   * inicio y cuotas identificadas por su periodo. Sin cadencia ni turno, que es lo que no conoce.
   */
  const seedMonthlyCircle = async (): Promise<{ circleId: string; userId: string }> => {
    const circleId = randomUUID();
    const userId = randomUUID();
    await runner.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'active')`, [
      userId,
      `${userId}@test.ayni`,
    ]);
    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state, current_period)
       VALUES ($1, 2400000, 'PEN', 12, DATE '2026-11-01', 'contributing', DATE '2027-01-01')`,
      [circleId],
    );
    for (const period of ['2026-11-01', '2026-12-01', '2027-01-01']) {
      await runner.query(
        `INSERT INTO circle_installments
           (id, circle_id, user_id, position, period, due_on, amount, currency, status)
         VALUES ($1, $2, $3, 1, $4::date, $4::date, 200000, 'PEN', 'pending')`,
        [randomUUID(), circleId, userId, period],
      );
    }
    await runner.query(
      `INSERT INTO circle_payouts (circle_id, period, user_id, position, amount, currency)
       VALUES ($1, DATE '2027-01-01', $2, 3, 2400000, 'PEN')`,
      [circleId, userId],
    );
    return { circleId, userId };
  };

  const columnsOf = async (table: string): Promise<string[]> => {
    const found = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    return found.map(({ column_name: name }) => name);
  };

  const constraintsOf = async (table: string): Promise<string[]> => {
    const found = await rows<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid = ($1 || '.' || $2)::regclass`,
      [schema, table],
    );
    return found.map(({ conname }) => conname);
  };

  const circleRow = (circleId: string): Promise<CircleTurnRow[]> =>
    rows<CircleTurnRow>('SELECT cadence, turns, current_turn FROM circles WHERE id = $1', [
      circleId,
    ]);

  const installmentTurns = (circleId: string): Promise<{ period: string; turn: number }[]> =>
    rows<{ period: string; turn: number }>(
      `SELECT to_char(period, 'YYYY-MM') AS period, turn FROM circle_installments
       WHERE circle_id = $1 ORDER BY period`,
      [circleId],
    );

  it('deja mensual al círculo que ya existía, con tantos turnos como meses', async () => {
    await revert();
    const { circleId } = await seedMonthlyCircle();
    await expand();

    const [circle] = await circleRow(circleId);

    expect(circle).toEqual({ cadence: 'monthly', turns: 12, current_turn: 3 });
  });

  it('el turno derivado reproduce el orden que hoy expresa el periodo', async () => {
    await revert();
    const { circleId } = await seedMonthlyCircle();
    await expand();

    const [payout] = await rows<{ turn: number }>(
      'SELECT turn FROM circle_payouts WHERE circle_id = $1',
      [circleId],
    );

    // El círculo empieza en 2026-11: ese mes es el turno 1 y el tercero el turno 3. Es el mismo
    // ordinal que calcula el motor de ciclo con `startsOnPeriod.monthsUntil(period) + 1`.
    expect(await installmentTurns(circleId)).toEqual([
      { period: '2026-11', turn: 1 },
      { period: '2026-12', turn: 2 },
      { period: '2027-01', turn: 3 },
    ]);
    expect(payout?.turn).toBe(3);
  });

  it('repetirla no cambia nada: el backfill solo toca lo que aún no tiene turno', async () => {
    await revert();
    const { circleId } = await seedMonthlyCircle();
    await expand();
    const [antes] = await circleRow(circleId);
    const cuotas = await installmentTurns(circleId);

    await expand();

    expect(await circleRow(circleId)).toEqual([antes]);
    expect(await installmentTurns(circleId)).toEqual(cuotas);
  });

  it('el down devuelve el esquema anterior y no toca los datos mensuales', async () => {
    const { circleId } = await seedMonthlyCircle();

    await revert();

    const circles = await columnsOf('circles');
    expect(circles).not.toContain('cadence');
    expect(circles).not.toContain('turns');
    expect(circles).not.toContain('current_turn');
    expect(await columnsOf('circle_installments')).not.toContain('turn');
    expect(await columnsOf('circle_payouts')).not.toContain('turn');
    // Vuelve el CHECK de día 1, con el nombre que tenía, y se van las unicidades por turno.
    expect(await constraintsOf('circles')).toContain('circles_starts_on_check');
    expect(await constraintsOf('circle_payouts')).not.toContain('uq_circle_payouts_turn');

    // Lo mensual sigue intacto: es lo único que el código anterior necesita.
    const [circle] = await rows<{ months: number; starts_on: string }>(
      `SELECT months, to_char(starts_on, 'YYYY-MM-DD') AS starts_on FROM circles WHERE id = $1`,
      [circleId],
    );
    expect(circle).toEqual({ months: 12, starts_on: '2026-11-01' });
    const [cuotas] = await rows<{ total: string }>(
      'SELECT count(*) AS total FROM circle_installments WHERE circle_id = $1',
      [circleId],
    );
    expect(cuotas?.total).toBe('3');

    // Revertido, una junta semanal vuelve a ser ininsertable: por eso el CHECK se retira aquí.
    await expect(
      runner.query(
        `INSERT INTO circles (payout_amount, currency, months, starts_on)
         VALUES (1200000, 'PEN', 4, DATE '2026-11-12')`,
      ),
    ).rejects.toThrow(/circles_starts_on_check/);

    await expand();
  });

  it('acepta una junta semanal que empieza el día 12', async () => {
    const circleId = randomUUID();

    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, months, turns, cadence, starts_on)
       VALUES ($1, 1200000, 'PEN', 4, 4, 'weekly', DATE '2026-11-12')`,
      [circleId],
    );

    const [circle] = await rows<{ starts_on: string; cadence: string; turns: number }>(
      `SELECT to_char(starts_on, 'YYYY-MM-DD') AS starts_on, cadence, turns
       FROM circles WHERE id = $1`,
      [circleId],
    );
    expect(circle).toEqual({ starts_on: '2026-11-12', cadence: 'weekly', turns: 4 });
  });

  it('rechaza una cadencia que el dominio no admite', async () => {
    await expect(
      runner.query(
        `INSERT INTO circles (payout_amount, currency, months, turns, cadence, starts_on)
         VALUES (1200000, 'PEN', 4, 4, 'diaria', DATE '2026-11-01')`,
      ),
    ).rejects.toThrow(/ck_circles_cadence/);
  });

  it('rechaza dos payouts del mismo turno en un círculo', async () => {
    const { circleId, userId } = await seedMonthlyCircle();
    const payout = (period: string, turn: number): Promise<unknown> =>
      runner.query(
        `INSERT INTO circle_payouts (circle_id, period, user_id, position, turn, amount, currency)
         VALUES ($1, $2::date, $3, 5, $4, 2400000, 'PEN')`,
        [circleId, period, userId, turn],
      );

    await payout('2027-02-01', 5);

    // Meses distintos, así que la unicidad mensual no interviene: lo que rechaza es la del turno.
    await expect(payout('2027-03-01', 5)).rejects.toThrow(/uq_circle_payouts_turn/);
  });

  it('las filas anteriores, con turno nulo, conviven con la unicidad nueva', async () => {
    const { circleId, userId } = await seedMonthlyCircle();
    const payoutSinTurno = (period: string): Promise<unknown> =>
      runner.query(
        `INSERT INTO circle_payouts (circle_id, period, user_id, position, amount, currency)
         VALUES ($1, $2::date, $3, 6, 2400000, 'PEN')`,
        [circleId, period, userId],
      );

    // Dos nulos son distintos en PostgreSQL: las filas que escribe el código anterior no chocan
    // entre sí, y siguen protegidas por la unicidad del periodo.
    await payoutSinTurno('2027-04-01');
    await payoutSinTurno('2027-05-01');

    await expect(payoutSinTurno('2027-05-01')).rejects.toThrow(/uq_circle_payouts_period/);
  });

  it('el código anterior sigue escribiendo sin cadencia ni turno', async () => {
    const circleId = randomUUID();
    const userId = randomUUID();
    await runner.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'active')`, [
      userId,
      `${userId}@test.ayni`,
    ]);

    // El mismo INSERT que hace hoy el repositorio: ni cadencia ni turnos.
    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on)
       VALUES ($1, 2400000, 'PEN', 12, DATE '2026-11-01')`,
      [circleId],
    );
    await runner.query(
      `INSERT INTO circle_installments
         (id, circle_id, user_id, position, period, due_on, amount, currency, status)
       VALUES ($1, $2, $3, 1, DATE '2026-11-01', DATE '2026-11-01', 200000, 'PEN', 'pending')`,
      [randomUUID(), circleId, userId],
    );

    const [circle] = await circleRow(circleId);
    // La cadencia la pone el DEFAULT; el turno queda pendiente hasta que escriba el código nuevo.
    expect(circle).toEqual({ cadence: 'monthly', turns: null, current_turn: null });
    const [cuota] = await rows<{ turn: number | null }>(
      'SELECT turn FROM circle_installments WHERE circle_id = $1',
      [circleId],
    );
    expect(cuota?.turn).toBeNull();
  });
});
