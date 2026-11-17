import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Identidades externas del login social (COPAYNI-91): la cuenta de la persona en Google o Apple,
 * vinculada a su usuario de Ayni.
 *
 * La clave es `(provider, subject)`, nunca el correo: el correo cambia y Apple puede no volver a
 * entregarlo. La unicidad la impone la base, así que dos primeros inicios simultáneos no pueden
 * crear dos cuentas para la misma identidad.
 */
export class CreateExternalIdentities1764763200000 implements MigrationInterface {
  name = 'CreateExternalIdentities1764763200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE external_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        provider varchar(16) NOT NULL CHECK (provider IN ('google', 'apple')),
        subject varchar(255) NOT NULL,
        email varchar(254),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz,
        CONSTRAINT uq_external_identities UNIQUE (provider, subject),
        -- Una persona no tiene dos cuentas del mismo proveedor.
        CONSTRAINT uq_external_identities_user UNIQUE (user_id, provider)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_external_identities_user ON external_identities (user_id)',
    );

    /**
     * Flujo web de Apple en Android: `state` y `nonce` del intento y el código interno con el que
     * la app canjea su sesión. Todo es de un solo uso y de vida corta; por el deep link nunca
     * viaja un token de sesión.
     */
    await queryRunner.query(`
      CREATE TABLE social_auth_flows (
        state char(43) PRIMARY KEY,
        provider varchar(16) NOT NULL CHECK (provider IN ('google', 'apple')),
        nonce char(43) NOT NULL,
        user_id uuid REFERENCES users (id) ON DELETE CASCADE,
        exchange_code_hash char(64) UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        state_used_at timestamptz,
        consumed_at timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_social_auth_flows_expiry ON social_auth_flows (expires_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE social_auth_flows');
    await queryRunner.query('DROP TABLE external_identities');
  }
}
