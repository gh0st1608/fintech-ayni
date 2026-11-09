import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Auditoría de las acciones del personal en el back-office (docs/backoffice-plan.md §4): de solo
 * inserción, con el mismo trigger que el registro contable.
 */
export class CreateStaffAuditLog1763380800000 implements MigrationInterface {
  name = 'CreateStaffAuditLog1763380800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id varchar(255) NOT NULL,
        actor_email varchar(254),
        action varchar(64) NOT NULL,
        entity varchar(32) NOT NULL,
        entity_id varchar(64),
        outcome varchar(16) NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
        details jsonb NOT NULL DEFAULT '{}',
        trace_id varchar(64),
        ip varchar(64),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_staff_audit_log_entity ON staff_audit_log (entity, entity_id, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_staff_audit_log_actor ON staff_audit_log (actor_id, created_at)',
    );
    await queryRunner.query(`
      CREATE TRIGGER tr_staff_audit_log_insert_only BEFORE UPDATE OR DELETE ON staff_audit_log
        FOR EACH ROW EXECUTE FUNCTION ledger_reject_change()
    `);
    await queryRunner.query(`
      CREATE TRIGGER tr_staff_audit_log_no_truncate BEFORE TRUNCATE ON staff_audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE staff_audit_log');
  }
}
