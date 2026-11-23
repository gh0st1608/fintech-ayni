import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Ordinal del turno que hoy expresa un mes: los mismos meses que cuenta `Period.monthsUntil`,
 * más uno, igual que `startsOnPeriod.monthsUntil(period) + 1` en el motor de ciclo. Mientras la
 * única cadencia sea mensual, el mes y el turno dicen lo mismo, y por eso el backfill puede
 * derivar uno del otro; en cuanto haya juntas semanales dejarán de coincidir, y es justo lo que
 * la columna nueva viene a resolver.
 */
const turnFromPeriod = (period: string, startsOn: string): string => `
  (extract(year FROM ${period})::int - extract(year FROM ${startsOn})::int) * 12
  + (extract(month FROM ${period})::int - extract(month FROM ${startsOn})::int)
  + 1`;

/** El `CHECK` de día 1 de `circles.starts_on` lo creó sin nombre la migración de círculos. */
const STARTS_ON_DAY_ONE = 'circles_starts_on_check';

/**
 * Expansión del modelo de turno (COPAYNI-107): la base aprende cadencia y turno **sin olvidar el
 * mes**, para que el código anterior y el nuevo puedan convivir y el despliegue se pueda
 * revertir. La retirada de las columnas mensuales es la contracción, COPAYNI-109.
 *
 * Tres decisiones que conviene no deshacer sin pensarlo:
 *
 * 1. **Las columnas nuevas admiten nulo a propósito.** Durante la expansión el que escribe sigue
 *    siendo el código anterior, que no conoce el turno: ponerlas `NOT NULL` aquí rompería cada
 *    alta de círculo de la versión que está en producción. El `NOT NULL` llega con la contracción,
 *    cuando el único que escribe es el código nuevo.
 *
 * 2. **Las unicidades nuevas conviven con las mensuales y no se estorban.** En PostgreSQL dos
 *    nulos son distintos, así que una fila anterior, con turno nulo, no choca con ninguna otra y
 *    sigue protegida por la unicidad del periodo. La unicidad del turno empieza a morder en
 *    cuanto alguien escribe turnos, que es lo que se busca.
 *
 * 3. **`starts_on` deja de exigir día 1 aquí**, y no en el ticket que traslada los `CHECK` de día
 *    1 al dominio (COPAYNI-108), porque sin retirarlo no se puede insertar una junta semanal: es
 *    la restricción que bloquea la cadencia, no una más de la familia.
 *
 * El `up` se puede repetir sin efecto: las columnas se añaden con `IF NOT EXISTS`, las
 * restricciones se recrean, y los backfills solo tocan las filas que todavía no tienen turno.
 * Hace falta porque una migración interrumpida se vuelve a correr, y porque el backfill y el
 * despliegue del código nuevo no ocurren en el mismo instante. Cada migración corre en su propia
 * transacción (`migrate.ts`, `transaction: 'each'`), de modo que un backfill a medias no existe:
 * o están todos los turnos derivados, o ninguno.
 *
 * El `down` devuelve el esquema anterior y no toca ningún dato mensual: lo único que pierde son
 * las columnas derivadas, que el `up` vuelve a calcular. Solo es posible mientras no haya una
 * junta cuyo inicio caiga fuera del día 1, porque al revertir se restaura ese `CHECK`; esa es la
 * razón de hacer la expansión antes de cambiar quien escribe.
 */
export class ExpandCircleTurns1764936000000 implements MigrationInterface {
  name = 'ExpandCircleTurns1764936000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circles
        ADD COLUMN IF NOT EXISTS cadence varchar(16) NOT NULL DEFAULT 'monthly',
        ADD COLUMN IF NOT EXISTS turns smallint,
        ADD COLUMN IF NOT EXISTS current_turn smallint
    `);
    await queryRunner.query(
      'ALTER TABLE circle_installments ADD COLUMN IF NOT EXISTS turn smallint',
    );
    await queryRunner.query('ALTER TABLE circle_payouts ADD COLUMN IF NOT EXISTS turn smallint');

    // Backfill. Los círculos que ya existen son todos mensuales, así que su cadencia es la que
    // deja el DEFAULT y su número de turnos es el de meses.
    await queryRunner.query(`
      UPDATE circles SET
        turns = COALESCE(turns, months),
        current_turn = CASE
          WHEN current_turn IS NOT NULL THEN current_turn
          WHEN current_period IS NULL THEN NULL
          ELSE ${turnFromPeriod('current_period', 'starts_on')}
        END
      WHERE turns IS NULL OR (current_turn IS NULL AND current_period IS NOT NULL)
    `);
    await queryRunner.query(`
      UPDATE circle_installments i
        SET turn = ${turnFromPeriod('i.period', 'c.starts_on')}
        FROM circles c
        WHERE c.id = i.circle_id AND i.turn IS NULL
    `);
    await queryRunner.query(`
      UPDATE circle_payouts p
        SET turn = ${turnFromPeriod('p.period', 'c.starts_on')}
        FROM circles c
        WHERE c.id = p.circle_id AND p.turn IS NULL
    `);

    // Restricciones después del backfill, para que validen los datos ya derivados.
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_cadence',
      "CHECK (cadence IN ('monthly', 'biweekly', 'weekly'))",
    );
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_turns',
      'CHECK (turns IS NULL OR turns >= 2)',
    );
    // El mismo reparto exacto que `ck_circles_exact_installment` exige sobre los meses: la cuota
    // base es el pozo entre los turnos, y un resto dejaría céntimos sin dueño.
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_exact_turn_installment',
      'CHECK (turns IS NULL OR payout_amount % turns = 0)',
    );
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_current_turn',
      'CHECK (current_turn IS NULL OR current_turn >= 1)',
    );
    await this.replace(
      queryRunner,
      'circle_installments',
      'ck_circle_installments_turn',
      'CHECK (turn IS NULL OR turn >= 1)',
    );
    await this.replace(
      queryRunner,
      'circle_payouts',
      'ck_circle_payouts_turn',
      'CHECK (turn IS NULL OR turn >= 1)',
    );

    // Unicidades por turno, hermanas de las mensuales: una cuota por miembro y turno, un payout
    // por turno. Son las que impiden cobrar dos veces el mismo turno cuando dos ejecuciones de la
    // tarea del ciclo se cruzan, igual que hoy lo impiden las del periodo.
    await this.replace(
      queryRunner,
      'circle_installments',
      'uq_circle_installments_turn',
      'UNIQUE (circle_id, position, turn)',
    );
    await this.replace(
      queryRunner,
      'circle_payouts',
      'uq_circle_payouts_turn',
      'UNIQUE (circle_id, turn)',
    );

    await queryRunner.query(`ALTER TABLE circles DROP CONSTRAINT IF EXISTS ${STARTS_ON_DAY_ONE}`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Al soltar la columna se van con ella sus `CHECK` y sus unicidades, que dependen de ella.
    await queryRunner.query('ALTER TABLE circle_payouts DROP COLUMN IF EXISTS turn');
    await queryRunner.query('ALTER TABLE circle_installments DROP COLUMN IF EXISTS turn');
    await queryRunner.query(`
      ALTER TABLE circles
        DROP COLUMN IF EXISTS current_turn,
        DROP COLUMN IF EXISTS turns,
        DROP COLUMN IF EXISTS cadence
    `);
    // Se restaura con el nombre que PostgreSQL le había dado, para que un `up` posterior lo
    // vuelva a encontrar.
    await this.replace(
      queryRunner,
      'circles',
      STARTS_ON_DAY_ONE,
      'CHECK (extract(day FROM starts_on) = 1)',
    );
  }

  /**
   * Deja la restricción `name` tal como dice `definition`, exista ya o no. PostgreSQL no admite
   * `ADD CONSTRAINT IF NOT EXISTS`, y repetir el `ADD` a secas falla: soltarla antes es lo que
   * hace que la migración se pueda volver a correr.
   */
  private async replace(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    definition: string,
  ): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}`);
  }
}
