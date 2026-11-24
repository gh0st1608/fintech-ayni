import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

/**
 * Las invariantes de día 1 y las unicidades por turno contra PostgreSQL (COPAYNI-108).
 *
 * Hallazgo de este ticket: de las seis restricciones `CHECK (extract(day FROM …) = 1)`, la única
 * que impedía una junta semanal era la de `circles.starts_on`, porque es una fecha real; la retiró
 * la expansión (COPAYNI-107) y su invariante vive ahora en el dominio, condicionada a la cadencia.
 * Las cinco que quedan son sobre columnas `period`, que **no guardan la fecha de un turno sino el
 * mes en que cae**: se escriben siempre como mes más `-01`, así que ninguna cadencia las incumple
 * y retirarlas solo quitaría una red. Lo que impedía guardar una junta de varios turnos por mes
 * eran las unicidades **por periodo**, ya retiradas por la contracción (COPAYNI-109), que a la vez
 * impuso `NOT NULL` en el turno: sin eso, retirarlas habría dejado sin proteger a las filas con
 * el turno vacío, porque dos nulos son distintos en PostgreSQL.
 *
 * Estas pruebas fijan las dos cosas: que cada invariante de día 1 sigue impuesta allí donde debe
 * estarlo, y que las unicidades por turno cubren lo que cubrían las de periodo.
 */
describe('Invariantes de día 1 y unicidades por turno (COPAYNI-108)', () => {
  let dataSource: DataSource;
  let circleId: string;
  let userId: string;

  beforeAll(async () => {
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    userId = await insertTestUser(dataSource);
    circleId = randomUUID();
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, turns, starts_on)
       VALUES ($1, 1200000, 'PEN', 4, '2026-11-01')`,
      [circleId],
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  /** Inserta una cuota con el mes, el turno y el puesto indicados. */
  const installment = (period: string, turn: number | null, position = 1) =>
    dataSource.query(
      `INSERT INTO circle_installments
         (id, circle_id, user_id, position, turn, period, due_on, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 300000, 'PEN', 'pending')`,
      [randomUUID(), circleId, userId, position, turn, period, period],
    );

  const payout = (period: string, turn: number | null) =>
    dataSource.query(
      `INSERT INTO circle_payouts (circle_id, turn, period, user_id, position, amount, currency)
       VALUES ($1, $2, $3::date, $4, 1, 1200000, 'PEN')`,
      [circleId, turn, period, userId],
    );

  describe('cada invariante de día 1 sigue impuesta donde le corresponde', () => {
    it('el mes de una cuota no puede ser otro día que el 1', async () => {
      await expect(installment('2026-11-15', 1)).rejects.toThrow(
        /circle_installments_period_check/,
      );
    });

    it('el mes de un payout no puede ser otro día que el 1', async () => {
      await expect(payout('2026-11-15', 1)).rejects.toThrow(/circle_payouts_period_check/);
    });

    it('el mes en curso de un círculo no puede ser otro día que el 1', async () => {
      await expect(
        dataSource.query('UPDATE circles SET current_period = $2::date WHERE id = $1', [
          circleId,
          '2026-11-15',
        ]),
      ).rejects.toThrow(/ck_circles_current_period/);
    });

    it('el mes de una expulsión no puede ser otro día que el 1', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO circle_expulsions
             (circle_id, user_id, position, period, expelled_on, overdue_amount, late_fee_amount,
              currency)
           VALUES ($1, $2, 1, '2026-11-15'::date, '2026-11-20'::date, 1000, 30, 'PEN')`,
          [circleId, userId],
        ),
      ).rejects.toThrow(/circle_expulsions_period_check/);
    });

    it('el mes de un movimiento contable no puede ser otro día que el 1', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO ledger_transactions (key, kind, circle_id, period)
           VALUES ($1, 'collection', $2, '2026-11-15'::date)`,
          [`t-${randomUUID()}`, circleId],
        ),
      ).rejects.toThrow(/ledger_transactions_period_check/);
    });

    it('una junta semanal guarda sus cuatro turnos del mismo mes sin incumplir ninguna', async () => {
      // Los cuatro turnos caen en noviembre y los cuatro se escriben como `2026-11-01`: la
      // invariante de día 1 no es la que estorba a una cadencia semanal.
      for (let turn = 1; turn <= 4; turn += 1) {
        await expect(installment('2026-11-01', turn, turn)).resolves.toBeDefined();
      }
    });
  });

  describe('las unicidades por turno cubren lo que cubrían las de periodo', () => {
    it('un miembro no puede tener dos cuotas del mismo turno', async () => {
      await installment('2026-12-01', 7, 7);
      await expect(installment('2026-12-01', 7, 7)).rejects.toThrow(/uq_circle_installments_turn/);
    });

    it('un miembro no puede tener dos cuotas del mismo turno en meses distintos', async () => {
      // Aquí la unicidad de periodo no interviene: los meses son distintos. Es el caso que solo
      // la unicidad por turno cubre, y el que importa cuando el calendario se corre.
      await installment('2027-01-01', 8, 8);
      await expect(installment('2027-02-01', 8, 8)).rejects.toThrow(/uq_circle_installments_turn/);
    });

    it('un turno no puede cobrar dos veces, aunque los meses difieran', async () => {
      await payout('2027-03-01', 9);
      await expect(payout('2027-04-01', 9)).rejects.toThrow(/uq_circle_payouts_turn/);
    });

    it('una cuota sin turno ya no se puede guardar (COPAYNI-109)', async () => {
      // Mientras el turno admitía nulo, la unicidad por turno no alcanzaba a esas filas y las
      // cubría la de periodo. La contracción cerró esa puerta con `NOT NULL`, que es lo que
      // permitió retirar la unicidad por periodo sin dejar nada sin proteger.
      await expect(installment('2027-05-01', null, 10)).rejects.toThrow(/not-null|turn/i);
    });

    it('una junta puede guardar dos turnos del mismo mes, que es lo que la de periodo impedía', async () => {
      // El caso que necesita una cadencia semanal: dos turnos del mismo miembro en el mismo mes.
      await expect(installment('2027-06-01', 11, 11)).resolves.toBeDefined();
      await expect(installment('2027-06-01', 12, 11)).resolves.toBeDefined();
    });
  });
});
