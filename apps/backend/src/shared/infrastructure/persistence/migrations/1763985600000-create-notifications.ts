import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Bandeja de notificaciones (COPAYNI-84). Guarda el tipo y los datos para que la app arme el texto
 * en su idioma. `dedupe_key` identifica el hecho (p. ej. `paid:<cuota>`): una persona nunca recibe
 * dos veces la misma notificación, aunque la tarea diaria o la bandeja se ejecuten de nuevo.
 */
export class CreateNotifications1763985600000 implements MigrationInterface {
  name = 'CreateNotifications1763985600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type varchar(32) NOT NULL,
        category varchar(16) NOT NULL CHECK (category IN ('payments', 'circles', 'account')),
        data jsonb NOT NULL DEFAULT '{}',
        dedupe_key varchar(160) NOT NULL,
        occurred_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz,
        CONSTRAINT uq_notifications_dedupe UNIQUE (user_id, dedupe_key)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_notifications_inbox ON notifications (user_id, occurred_at DESC, id DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE notifications');
  }
}
