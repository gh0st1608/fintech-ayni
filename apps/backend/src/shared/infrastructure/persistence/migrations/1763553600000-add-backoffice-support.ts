import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Soporte desde el back-office (docs/backoffice-plan.md, fase 2):
 * - Bloqueo de personas: una persona bloqueada no abre ni renueva sesión.
 * - Notas de soporte por persona, de solo inserción como la auditoría.
 * - Ejecuciones del ciclo mensual, que hasta ahora solo quedaban en los logs.
 */
export class AddBackofficeSupport1763553600000 implements MigrationInterface {
  name = 'AddBackofficeSupport1763553600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN blocked_at timestamptz,
        ADD COLUMN blocked_reason varchar(500),
        ADD CONSTRAINT ck_users_blocked_reason CHECK (blocked_at IS NULL OR blocked_reason IS NOT NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE support_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        author_id varchar(255) NOT NULL,
        author_email varchar(254),
        body varchar(2000) NOT NULL CHECK (length(trim(body)) > 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_support_notes_user ON support_notes (user_id, created_at)',
    );
    await queryRunner.query(`
      CREATE TRIGGER tr_support_notes_insert_only BEFORE UPDATE OR DELETE ON support_notes
        FOR EACH ROW EXECUTE FUNCTION ledger_reject_change()
    `);
    await queryRunner.query(`
      CREATE TRIGGER tr_support_notes_no_truncate BEFORE TRUNCATE ON support_notes
        FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change()
    `);

    await queryRunner.query(`
      CREATE TABLE circle_cycle_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_date date NOT NULL,
        started_at timestamptz NOT NULL,
        finished_at timestamptz NOT NULL,
        advanced integer NOT NULL CHECK (advanced >= 0),
        locked integer NOT NULL CHECK (locked >= 0),
        failed integer NOT NULL CHECK (failed >= 0),
        failures jsonb NOT NULL DEFAULT '[]'
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_circle_cycle_runs_started ON circle_cycle_runs (started_at DESC, id DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_cycle_runs');
    await queryRunner.query('DROP TABLE support_notes');
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_blocked_reason,
        DROP COLUMN blocked_reason,
        DROP COLUMN blocked_at
    `);
  }
}
