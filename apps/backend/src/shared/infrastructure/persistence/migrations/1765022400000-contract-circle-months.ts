import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Ordinal del turno que expresa un mes, igual que en la expansión (COPAYNI-107): los meses
 * transcurridos desde el arranque, más uno. Aquí solo lo necesita el relleno defensivo.
 */
const turnFromPeriod = (period: string, startsOn: string): string => `
  (extract(year FROM ${period})::int - extract(year FROM ${startsOn})::int) * 12
  + (extract(month FROM ${period})::int - extract(month FROM ${startsOn})::int)
  + 1`;

/** Lo creó sin nombre la migración de círculos, al declarar la columna. */
const MONTHS_AT_LEAST_TWO = 'circles_months_check';

/**
 * Contracción del modelo de turno (COPAYNI-109): se retira lo que la expansión dejó por
 * compatibilidad, ahora que el único que escribe es el código nuevo.
 *
 * **Esta migración solo puede aplicarse en un despliegue posterior al de la expansión**
 * (COPAYNI-107) y al del motor por turnos (COPAYNI-126). Si se adelanta, la versión anterior del
 * código —que escribe `months` y no escribe el turno— deja de poder guardar un círculo.
 *
 * Lo que hace, en este orden, que es el único seguro:
 *
 * 1. **Rellena el turno que siguiera vacío.** La expansión rellenó lo que había entonces, pero
 *    entre ese despliegue y el del motor por turnos el código anterior pudo escribir filas sin
 *    turno. Es idempotente y no toca ninguna fila que ya lo tenga.
 * 2. **Impone `NOT NULL` en las columnas de turno** y retira de sus `CHECK` la rama `IS NULL`,
 *    que era la que permitía convivir con el código anterior.
 * 3. **Retira las unicidades por periodo.** Son las que impedían que una junta tuviera dos turnos
 *    en el mismo mes, es decir, las que impedían una cadencia semanal. Solo pueden retirarse
 *    después del paso 2: con el turno vacío, dos nulos son distintos en PostgreSQL y la unicidad
 *    por turno no protegería nada.
 * 4. **Retira `circles.months`**, cuyas lecturas cubre `turns`. Con la columna se van sus dos
 *    restricciones, `circles_months_check` y `ck_circles_exact_installment`, que tienen su
 *    equivalente sobre `turns`.
 *
 * Las columnas de periodo **se conservan**: los informes y los agregados del back-office hablan
 * en meses, y sus `CHECK` de día 1 siguen siendo ciertos en toda cadencia, porque guardan el mes
 * en que cae el turno y no la fecha del turno (COPAYNI-108).
 *
 * A diferencia de la expansión, el `up` no necesita poder repetirse: cada migración corre en su
 * propia transacción (`migrate.ts`, `transaction: 'each'`), de modo que o se aplica entera o no
 * se aplica, y el paso 1 nunca se encuentra con `months` ya retirada.
 *
 * Sobre la reversibilidad: el `down` recupera el esquema anterior y no pierde datos, pero
 * **solo mientras ninguna junta tenga dos turnos en el mismo mes**, porque recrea las unicidades
 * por periodo. Esa es la ventana real de vuelta atrás: termina cuando se habilite una cadencia
 * distinta de la mensual (COPAYNI-121), no cuando se aplique esta migración.
 */
export class ContractCircleMonths1765022400000 implements MigrationInterface {
  name = 'ContractCircleMonths1765022400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Relleno defensivo, antes de soltar `months`, que es de donde sale el número de turnos.
    await queryRunner.query('UPDATE circles SET turns = months WHERE turns IS NULL');
    await queryRunner.query(`
      UPDATE circles SET current_turn = ${turnFromPeriod('current_period', 'starts_on')}
       WHERE current_turn IS NULL AND current_period IS NOT NULL
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

    // 2. El turno deja de poder faltar.
    await queryRunner.query('ALTER TABLE circles ALTER COLUMN turns SET NOT NULL');
    await queryRunner.query('ALTER TABLE circle_installments ALTER COLUMN turn SET NOT NULL');
    await queryRunner.query('ALTER TABLE circle_payouts ALTER COLUMN turn SET NOT NULL');
    await this.replace(queryRunner, 'circles', 'ck_circles_turns', 'CHECK (turns >= 2)');
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_exact_turn_installment',
      'CHECK (payout_amount % turns = 0)',
    );
    await this.replace(
      queryRunner,
      'circle_installments',
      'ck_circle_installments_turn',
      'CHECK (turn >= 1)',
    );
    await this.replace(
      queryRunner,
      'circle_payouts',
      'ck_circle_payouts_turn',
      'CHECK (turn >= 1)',
    );
    // `current_turn` sigue admitiendo nulo: un círculo que no está en curso no tiene turno.

    // 3. Fuera las unicidades por periodo: es lo que habilita varios turnos en un mes.
    await queryRunner.query(
      'ALTER TABLE circle_installments DROP CONSTRAINT IF EXISTS uq_circle_installments_period',
    );
    await queryRunner.query(
      'ALTER TABLE circle_payouts DROP CONSTRAINT IF EXISTS uq_circle_payouts_period',
    );

    // 4. Y fuera el número de turnos bajo su nombre mensual.
    await queryRunner.query('ALTER TABLE circles DROP COLUMN IF EXISTS months');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE circles ADD COLUMN IF NOT EXISTS months smallint');
    await queryRunner.query('UPDATE circles SET months = turns WHERE months IS NULL');
    await queryRunner.query('ALTER TABLE circles ALTER COLUMN months SET NOT NULL');
    await this.replace(queryRunner, 'circles', MONTHS_AT_LEAST_TWO, 'CHECK (months >= 2)');
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_exact_installment',
      'CHECK (payout_amount % months = 0)',
    );

    // Vuelven las unicidades por periodo. Falla si alguna junta ya tiene dos turnos en el mismo
    // mes, que es justo lo que estas restricciones prohíben: ahí la contracción ya no se revierte.
    await this.replace(
      queryRunner,
      'circle_installments',
      'uq_circle_installments_period',
      'UNIQUE (circle_id, position, period)',
    );
    await this.replace(
      queryRunner,
      'circle_payouts',
      'uq_circle_payouts_period',
      'UNIQUE (circle_id, period)',
    );

    // Y el turno vuelve a poder faltar, para que el código anterior pueda escribir.
    await this.replace(
      queryRunner,
      'circle_payouts',
      'ck_circle_payouts_turn',
      'CHECK (turn IS NULL OR turn >= 1)',
    );
    await this.replace(
      queryRunner,
      'circle_installments',
      'ck_circle_installments_turn',
      'CHECK (turn IS NULL OR turn >= 1)',
    );
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_exact_turn_installment',
      'CHECK (turns IS NULL OR payout_amount % turns = 0)',
    );
    await this.replace(
      queryRunner,
      'circles',
      'ck_circles_turns',
      'CHECK (turns IS NULL OR turns >= 2)',
    );
    await queryRunner.query('ALTER TABLE circle_payouts ALTER COLUMN turn DROP NOT NULL');
    await queryRunner.query('ALTER TABLE circle_installments ALTER COLUMN turn DROP NOT NULL');
    await queryRunner.query('ALTER TABLE circles ALTER COLUMN turns DROP NOT NULL');
  }

  /**
   * Deja la restricción `name` tal como dice `definition`, exista ya o no: PostgreSQL no admite
   * `ADD CONSTRAINT IF NOT EXISTS`, y repetir el `ADD` a secas falla.
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
