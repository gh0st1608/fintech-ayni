import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Envío push de las notificaciones (COPAYNI-85), sobre la bandeja de COPAYNI-84.
 *
 * - `user_push_devices`: los dispositivos donde la persona recibe el aviso. El token es único en
 *   todo el sistema porque identifica la instalación: si alguien inicia sesión con otra cuenta en
 *   el mismo celular, el token cambia de dueño en vez de duplicarse.
 * - `notification_preferences`: una fila por persona; sin fila, todo está activado.
 * - `notifications.pushed_at` y `push_attempts`: cada notificación se envía una sola vez y los
 *   fallos no se reintentan para siempre.
 *
 * Las notificaciones que ya existen se marcan como enviadas: su historia no debe llegar al celular
 * de nadie cuando esto se despliegue.
 */
export class CreatePushDevices1764590400000 implements MigrationInterface {
  name = 'CreatePushDevices1764590400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_push_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token varchar(200) NOT NULL,
        platform varchar(16) NOT NULL CHECK (platform IN ('ios', 'android')),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        disabled_at timestamptz,
        disabled_reason varchar(64),
        CONSTRAINT uq_user_push_devices_token UNIQUE (token)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_user_push_devices_active ON user_push_devices (user_id)
         WHERE disabled_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        push_enabled boolean NOT NULL DEFAULT true,
        payments boolean NOT NULL DEFAULT true,
        circles boolean NOT NULL DEFAULT true,
        account boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      'ALTER TABLE notifications ADD COLUMN pushed_at timestamptz, ' +
        'ADD COLUMN push_attempts smallint NOT NULL DEFAULT 0',
    );
    // La historia anterior no se envía: solo lo que se cree a partir de ahora.
    await queryRunner.query('UPDATE notifications SET pushed_at = now()');
    await queryRunner.query(
      `CREATE INDEX ix_notifications_pending_push ON notifications (created_at)
         WHERE pushed_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_notifications_pending_push');
    await queryRunner.query(
      'ALTER TABLE notifications DROP COLUMN pushed_at, DROP COLUMN push_attempts',
    );
    await queryRunner.query('DROP TABLE notification_preferences');
    await queryRunner.query('DROP TABLE user_push_devices');
  }
}
