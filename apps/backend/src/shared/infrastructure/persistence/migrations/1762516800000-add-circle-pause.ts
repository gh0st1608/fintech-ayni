import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Pausa del admin general (COPAYNI-61): desde cuándo está pausado el círculo y la auditoría de
 * cada pausa y reanudación, con el actor, el motivo, el antes y el después. La auditoría es solo
 * de inserción, como el registro contable.
 */
export class AddCirclePause1762516800000 implements MigrationInterface {
  name = 'AddCirclePause1762516800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circles
        ADD COLUMN paused_on date,
        ADD CONSTRAINT ck_circles_paused_on CHECK ((cycle_state = 'paused') = (paused_on IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE TABLE circle_admin_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        action varchar(16) NOT NULL CHECK (action IN ('pause', 'resume')),
        actor_id varchar(255) NOT NULL,
        reason text NOT NULL CHECK (length(trim(reason)) > 0),
        before jsonb NOT NULL,
        after jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_circle_admin_events_circle ON circle_admin_events (circle_id, created_at)',
    );
    await queryRunner.query(`
      CREATE TRIGGER tr_circle_admin_events_insert_only
        BEFORE UPDATE OR DELETE ON circle_admin_events
        FOR EACH ROW EXECUTE FUNCTION ledger_reject_change()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_admin_events');
    await queryRunner.query(
      'ALTER TABLE circles DROP CONSTRAINT ck_circles_paused_on, DROP COLUMN paused_on',
    );
  }
}
