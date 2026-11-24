import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import {
  turnDateSql,
  turnMonthSql,
} from '@src/modules/circles/infrastructure/persistence/typeorm/turn-date.sql';
import { SqlPayoutSchedule } from '@src/modules/payouts/infrastructure/persistence/payout.adapters';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

/**
 * El espejo en SQL de la regla de avance de la cadencia (COPAYNI-120).
 *
 * El feed de notificaciones y el calendario de cobros calculaban el día del turno sumando meses a
 * la posición, que solo acierta en cadencia mensual: en una junta semanal de cuatro turnos, tres
 * de cada cuatro miembros quedaban con su turno en el mes equivocado, y de ese dato depende la
 * regla que impide cambiar la cuenta de cobro en el mes en que se cobra.
 *
 * Duplicar la aritmética de calendario en SQL solo se sostiene si alguien comprueba que las dos
 * copias dicen lo mismo. Esto es ese alguien.
 */
describe('El día del turno en SQL coincide con el dominio (COPAYNI-120)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
  });

  afterAll(() => dataSource.destroy());

  /** El `CASE` evaluado sin tablas: lo que se compara es la expresión, no el esquema. */
  const sqlTurnDate = async (
    startsOn: string,
    cadence: string,
    position: number,
  ): Promise<string> => {
    const [row] = await dataSource.query<{ turn_on: string }[]>(
      `SELECT to_char(${turnDateSql('c', 'm.position')}, 'YYYY-MM-DD') AS turn_on
         FROM (SELECT $1::date AS starts_on, $2::varchar AS cadence) c,
              (SELECT $3::int AS position) m`,
      [startsOn, cadence, position],
    );
    return row!.turn_on;
  };

  it.each([
    ['monthly', '2026-11-01'],
    ['biweekly', '2026-11-04'],
    ['weekly', '2026-11-04'],
  ])('en cadencia %s da el mismo día que TurnSchedule, turno por turno', async (id, startsOn) => {
    const cadence = Cadence.parse(id);
    const schedule = new TurnSchedule(LocalDate.parse(startsOn), cadence, 12);

    for (let turn = 1; turn <= 12; turn += 1) {
      await expect(sqlTurnDate(startsOn, id, turn)).resolves.toBe(schedule.dueOn(turn).toString());
    }
  });

  it('ajusta al último día del mes cuando el día no existe, igual que el dominio', async () => {
    // El 31 de enero más un paso mensual es el 28 de febrero, no una fecha imposible.
    const schedule = new TurnSchedule(LocalDate.parse('2027-01-31'), Cadence.monthly, 3);

    await expect(sqlTurnDate('2027-01-31', 'monthly', 2)).resolves.toBe(
      schedule.dueOn(2).toString(),
    );
    await expect(sqlTurnDate('2027-01-31', 'monthly', 2)).resolves.toBe('2027-02-28');
  });

  it('una cadencia sin mapear deja el día en nulo, para que la fila desaparezca y no mienta', async () => {
    const [row] = await dataSource.query<{ turn_on: string | null }[]>(
      `SELECT ${turnDateSql('c', 'm.position')} AS turn_on
         FROM (SELECT DATE '2026-11-01' AS starts_on, 'trimestral'::varchar AS cadence) c,
              (SELECT 2 AS position) m`,
    );

    expect(row?.turn_on).toBeNull();
    // Y el mes, que es lo que leen los avisos, también.
    const [month] = await dataSource.query<{ turn_month: string | null }[]>(
      `SELECT ${turnMonthSql('c', 'm.position')} AS turn_month
         FROM (SELECT DATE '2026-11-01' AS starts_on, 'trimestral'::varchar AS cadence) c,
              (SELECT 2 AS position) m`,
    );
    expect(month?.turn_month).toBeNull();
  });

  describe('el calendario de cobros del usuario', () => {
    const circleWithMember = async (
      cadence: string,
      startsOn: string,
      position: number,
    ): Promise<string> => {
      const circleId = randomUUID();
      const userId = await insertTestUser(dataSource);
      await dataSource.query(
        `INSERT INTO circles (id, payout_amount, currency, turns, cadence, starts_on, cycle_state)
         VALUES ($1, 1200000, 'PEN', 4, $2, $3::date, 'contributing')`,
        [circleId, cadence, startsOn],
      );
      await dataSource.query(
        `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), circleId, userId, position, randomUUID()],
      );
      return userId;
    };

    it('da el mes real del turno en una junta semanal, y no el de sumar meses', async () => {
      // Cuarto turno de una junta semanal que arranca el 4 de noviembre: cobra el 25 de
      // noviembre. Sumando meses a la posición, el aviso y la restricción caían en febrero.
      const userId = await circleWithMember('weekly', '2026-11-04', 4);
      const schedule = new SqlPayoutSchedule(dataSource);

      const periods = await schedule.payoutPeriodsOf(userId);

      expect(periods.map((period) => period.toString())).toEqual(['2026-11']);
    });

    it('en cadencia mensual devuelve lo mismo que antes', async () => {
      const userId = await circleWithMember('monthly', '2026-11-01', 4);
      const schedule = new SqlPayoutSchedule(dataSource);

      const periods = await schedule.payoutPeriodsOf(userId);

      expect(periods.map((period) => period.toString())).toEqual(['2027-02']);
    });
  });
});
