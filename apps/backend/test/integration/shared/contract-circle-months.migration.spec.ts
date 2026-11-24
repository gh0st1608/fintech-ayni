import { randomUUID } from 'node:crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { validateEnvironment } from '@src/config/env.validation';
import { MIGRATIONS } from '@src/shared/infrastructure/persistence/migrations';
import { ContractCircleMonths1765022400000 } from '@src/shared/infrastructure/persistence/migrations/1765022400000-contract-circle-months';
import { dataSourceOptions } from '@src/shared/infrastructure/persistence/typeorm-options';
import { TEST_ENV } from '@test/setup-env';

/**
 * La migración de contracción del turno (COPAYNI-109) contra PostgreSQL real.
 *
 * Mismo montaje que la prueba de la expansión: un **esquema propio** construido con la cadena
 * completa de migraciones, porque para probar la contracción hay que volver al esquema anterior,
 * sembrar datos y volver a contraer, y eso toma candados exclusivos sobre `circles` que
 * bloquearían a los demás archivos de la suite, que corren en paralelo.
 */
describe('Migración de contracción del turno (COPAYNI-109)', () => {
  const schema = `mig_contrae_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const migration = new ContractCircleMonths1765022400000();

  let runner: QueryRunner;
  let dataSource: DataSource;

  /** `QueryRunner.query` devuelve `any`: aquí es donde las filas reciben tipo, una sola vez. */
  const rows = async <T>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
    (await runner.query(sql, parameters)) as T[];

  /** Devuelve el esquema al estado anterior a la contracción. */
  const revert = (): Promise<void> => migration.down(runner);
  /** Aplica la contracción, con su relleno defensivo. */
  const contract = (): Promise<void> => migration.up(runner);

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
  }, 120_000);

  afterAll(async () => {
    await runner.query('SET search_path TO public');
    await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await runner.release();
    await dataSource.destroy();
  });

  const columnsOf = async (table: string): Promise<string[]> => {
    const found = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    return found.map(({ column_name: name }) => name);
  };

  const nullableOf = async (table: string, column: string): Promise<string> => {
    const [found] = await rows<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      [schema, table, column],
    );
    return found!.is_nullable;
  };

  const constraintsOf = async (table: string): Promise<string[]> => {
    const found = await rows<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid = ($1 || '.' || $2)::regclass`,
      [schema, table],
    );
    return found.map(({ conname }) => conname);
  };

  const newUser = async (): Promise<string> => {
    const userId = randomUUID();
    await runner.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'active')`, [
      userId,
      `${userId}@test.ayni`,
    ]);
    return userId;
  };

  /** Un círculo con el esquema contraído: turnos, sin `months`. */
  const seedCircle = async (): Promise<{ circleId: string; userId: string }> => {
    const circleId = randomUUID();
    const userId = await newUser();
    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, turns, starts_on, cycle_state,
                            current_period, current_turn, cadence)
       VALUES ($1, 1200000, 'PEN', 4, DATE '2026-11-04', 'contributing', DATE '2026-11-01', 1,
               'weekly')`,
      [circleId],
    );
    return { circleId, userId };
  };

  /**
   * Un círculo mensual tal como lo escribía el código anterior a la expansión: con `months`, sin
   * turnos y con las cuotas identificadas por su periodo. Requiere el esquema revertido.
   */
  const seedLegacyCircle = async (): Promise<{ circleId: string; userId: string }> => {
    const circleId = randomUUID();
    const userId = await newUser();
    await runner.query(
      `INSERT INTO circles (id, payout_amount, currency, months, turns, starts_on, cycle_state,
                            current_period)
       VALUES ($1, 2400000, 'PEN', 12, NULL, DATE '2026-11-01', 'contributing',
               DATE '2027-01-01')`,
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

  const installment = (
    circleId: string,
    userId: string,
    period: string,
    turn: number | null,
    position = 1,
  ) =>
    runner.query(
      `INSERT INTO circle_installments
         (id, circle_id, user_id, position, turn, period, due_on, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6::date, $6::date, 300000, 'PEN', 'pending')`,
      [randomUUID(), circleId, userId, position, turn, period],
    );

  /** Esquema limpio de círculos antes de cada caso: el esquema es de este archivo solo. */
  beforeEach(async () => {
    for (const table of ['circle_payouts', 'circle_installments', 'circles']) {
      await runner.query(`DELETE FROM ${table}`);
    }
  });

  /** Ningún caso deja el esquema a medias, pase lo que pase dentro. */
  afterEach(async () => {
    if ((await columnsOf('circles')).includes('months')) await contract();
  });

  it('retira months y las unicidades por periodo, y conserva las de turno y el día 1', async () => {
    expect(await columnsOf('circles')).not.toContain('months');
    expect(await columnsOf('circles')).toContain('turns');

    const installments = await constraintsOf('circle_installments');
    const payouts = await constraintsOf('circle_payouts');
    expect(installments).not.toContain('uq_circle_installments_period');
    expect(payouts).not.toContain('uq_circle_payouts_period');
    expect(installments).toContain('uq_circle_installments_turn');
    expect(payouts).toContain('uq_circle_payouts_turn');

    // El día 1 de las columnas de periodo se conserva: es la invariante de un marcador de mes,
    // cierta en toda cadencia, y los informes siguen agregando por mes (COPAYNI-108).
    expect(installments).toContain('circle_installments_period_check');
    expect(payouts).toContain('circle_payouts_period_check');
    expect(await constraintsOf('circles')).toContain('ck_circles_current_period');

    // Y con `months` se fueron sus dos restricciones, que tienen su equivalente sobre `turns`.
    const circles = await constraintsOf('circles');
    expect(circles).not.toContain('circles_months_check');
    expect(circles).not.toContain('ck_circles_exact_installment');
    expect(circles).toContain('ck_circles_turns');
    expect(circles).toContain('ck_circles_exact_turn_installment');
  });

  it('el turno deja de poder faltar', async () => {
    expect(await nullableOf('circles', 'turns')).toBe('NO');
    expect(await nullableOf('circle_installments', 'turn')).toBe('NO');
    expect(await nullableOf('circle_payouts', 'turn')).toBe('NO');
    // El turno en curso sigue admitiendo nulo: un círculo que no está en curso no tiene turno.
    expect(await nullableOf('circles', 'current_turn')).toBe('YES');

    const { circleId, userId } = await seedCircle();
    await expect(installment(circleId, userId, '2026-11-01', null)).rejects.toThrow(/turn/i);
  });

  it('una junta guarda dos turnos del mismo mes, que es lo que la unicidad por periodo impedía', async () => {
    const { circleId, userId } = await seedCircle();

    // Los cuatro turnos de una junta semanal caen en noviembre. Con la unicidad por periodo,
    // el segundo no entraba: era lo que impedía la cadencia.
    for (let turn = 1; turn <= 4; turn += 1) {
      await expect(installment(circleId, userId, '2026-11-01', turn)).resolves.toBeDefined();
    }
    for (let turn = 1; turn <= 4; turn += 1) {
      await expect(
        runner.query(
          `INSERT INTO circle_payouts (circle_id, turn, period, user_id, position, amount, currency)
           VALUES ($1, $2, DATE '2026-11-01', $3, $2, 1200000, 'PEN')`,
          [circleId, turn, userId],
        ),
      ).resolves.toBeDefined();
    }

    // Y el mismo turno sigue sin poder repetirse, que es lo que ahora protege la unicidad.
    await expect(installment(circleId, userId, '2026-11-01', 2)).rejects.toThrow(
      /uq_circle_installments_turn/,
    );
  });

  it('rellena el turno que el código anterior hubiera dejado vacío', async () => {
    // Entre el despliegue de la expansión y el del motor por turnos, el código anterior pudo
    // escribir filas sin turno: la contracción las rellena antes de imponer `NOT NULL`.
    await revert();
    const { circleId } = await seedLegacyCircle();
    await contract();

    const [circle] = await rows<{ turns: number; current_turn: number }>(
      'SELECT turns, current_turn FROM circles WHERE id = $1',
      [circleId],
    );
    expect(circle).toEqual({ turns: 12, current_turn: 3 });
    expect(
      await rows<{ period: string; turn: number }>(
        `SELECT to_char(period, 'YYYY-MM') AS period, turn FROM circle_installments
          WHERE circle_id = $1 ORDER BY period`,
        [circleId],
      ),
    ).toEqual([
      { period: '2026-11', turn: 1 },
      { period: '2026-12', turn: 2 },
      { period: '2027-01', turn: 3 },
    ]);
    expect(
      await rows<{ turn: number }>('SELECT turn FROM circle_payouts WHERE circle_id = $1', [
        circleId,
      ]),
    ).toEqual([{ turn: 3 }]);
  });

  it('el down devuelve months y las unicidades por periodo, sin perder datos', async () => {
    await revert();
    const { circleId } = await seedLegacyCircle();
    await contract();
    await revert();

    expect(await columnsOf('circles')).toContain('months');
    expect(await nullableOf('circles', 'months')).toBe('NO');
    expect(await nullableOf('circle_installments', 'turn')).toBe('YES');
    expect(await constraintsOf('circle_installments')).toContain('uq_circle_installments_period');
    expect(await constraintsOf('circle_payouts')).toContain('uq_circle_payouts_period');
    expect(await constraintsOf('circles')).toContain('circles_months_check');

    // Los datos mensuales siguen enteros, y `months` se recupera del número de turnos.
    const [circle] = await rows<{ months: number; turns: number; starts_on: string }>(
      `SELECT months, turns, to_char(starts_on, 'YYYY-MM-DD') AS starts_on
         FROM circles WHERE id = $1`,
      [circleId],
    );
    expect(circle).toEqual({ months: 12, turns: 12, starts_on: '2026-11-01' });
    expect(
      await rows<{ total: number }>(
        'SELECT count(*)::int AS total FROM circle_installments WHERE circle_id = $1',
        [circleId],
      ),
    ).toEqual([{ total: 3 }]);
  });

  it('el down ya no es posible cuando una junta tiene dos turnos en el mismo mes', async () => {
    const { circleId, userId } = await seedCircle();
    await installment(circleId, userId, '2026-11-01', 1);
    await installment(circleId, userId, '2026-11-01', 2);

    // Vuelta atrás dentro de una transacción, que es como corren las migraciones
    // (`migrate.ts`, `transaction: 'each'`): falla al recrear la unicidad por periodo y no deja
    // el esquema a medias. Es la ventana real de reversibilidad, y se cierra en cuanto exista
    // una junta de varios turnos por mes, no al aplicar la contracción.
    await runner.startTransaction();
    await expect(revert()).rejects.toThrow(/uq_circle_installments_period/);
    await runner.rollbackTransaction();

    expect(await columnsOf('circles')).not.toContain('months');
  });
});
