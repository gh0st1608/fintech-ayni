import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Ciclo mensual del círculo (COPAYNI-56): estado y mes en curso, cuotas por miembro y mes, y
 * payouts. Los índices únicos impiden abrir dos veces la cuota de un mes o pagar dos veces un
 * payout, aunque dos ejecuciones de la tarea se crucen. Los círculos existentes empiezan en
 * `collecting` y la tarea los pone al día.
 */
export class CreateCircleCycle1762084800000 implements MigrationInterface {
  name = 'CreateCircleCycle1762084800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circles
        ADD COLUMN cycle_state varchar(16) NOT NULL DEFAULT 'collecting'
          CONSTRAINT ck_circles_cycle_state
          CHECK (cycle_state IN ('collecting', 'contributing', 'finished', 'paused')),
        ADD COLUMN current_period date
          CONSTRAINT ck_circles_current_period CHECK (extract(day FROM current_period) = 1)
    `);
    await queryRunner.query('CREATE INDEX ix_circles_cycle_state ON circles (cycle_state)');
    await queryRunner.query(`
      CREATE TABLE circle_installments (
        id uuid PRIMARY KEY,
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        position smallint NOT NULL CHECK (position >= 1),
        period date NOT NULL CHECK (extract(day FROM period) = 1),
        due_on date NOT NULL,
        amount bigint NOT NULL CHECK (amount >= 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        status varchar(16) NOT NULL CHECK (status IN ('pending', 'paid', 'overdue')),
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_circle_installments_period UNIQUE (circle_id, position, period)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_circle_installments_user_id ON circle_installments (user_id)',
    );
    await queryRunner.query(`
      CREATE TABLE circle_payouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        period date NOT NULL CHECK (extract(day FROM period) = 1),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        position smallint NOT NULL CHECK (position >= 1),
        amount bigint NOT NULL CHECK (amount >= 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        disbursed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_circle_payouts_period UNIQUE (circle_id, period)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_payouts');
    await queryRunner.query('DROP TABLE circle_installments');
    await queryRunner.query('DROP INDEX ix_circles_cycle_state');
    await queryRunner.query(
      'ALTER TABLE circles DROP COLUMN current_period, DROP COLUMN cycle_state',
    );
  }
}
