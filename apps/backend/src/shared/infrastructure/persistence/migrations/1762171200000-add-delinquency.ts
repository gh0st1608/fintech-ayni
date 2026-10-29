import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Impago (COPAYNI-57): cuotas incobrables (`defaulted`), membresías expulsadas y la expulsión
 * con su deuda y su devolución. Una sola expulsión por miembro y círculo, aunque dos ejecuciones
 * de la tarea se crucen. Mientras `settled_at` sea `NULL`, el usuario no puede unirse a otro
 * círculo.
 */
export class AddDelinquency1762171200000 implements MigrationInterface {
  name = 'AddDelinquency1762171200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_installments
        DROP CONSTRAINT circle_installments_status_check,
        ADD CONSTRAINT circle_installments_status_check
          CHECK (status IN ('pending', 'paid', 'overdue', 'defaulted'))
    `);
    await queryRunner.query('ALTER TABLE circle_memberships ADD COLUMN expelled_at timestamptz');
    await queryRunner.query(`
      CREATE TABLE circle_expulsions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        position smallint NOT NULL CHECK (position >= 1),
        period date NOT NULL CHECK (extract(day FROM period) = 1),
        expelled_on date NOT NULL,
        overdue_amount bigint NOT NULL CHECK (overdue_amount >= 0),
        late_fee_amount bigint NOT NULL CHECK (late_fee_amount >= 0),
        refund_amount bigint CHECK (refund_amount >= 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        settled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_circle_expulsions_member UNIQUE (circle_id, user_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_circle_expulsions_open_debts ON circle_expulsions (user_id) WHERE settled_at IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_expulsions');
    await queryRunner.query('ALTER TABLE circle_memberships DROP COLUMN expelled_at');
    await queryRunner.query(`
      ALTER TABLE circle_installments
        DROP CONSTRAINT circle_installments_status_check,
        ADD CONSTRAINT circle_installments_status_check
          CHECK (status IN ('pending', 'paid', 'overdue'))
    `);
  }
}
