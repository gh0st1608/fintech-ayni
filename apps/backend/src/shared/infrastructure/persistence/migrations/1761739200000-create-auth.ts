import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Usuarios, desafíos OTP y refresh tokens (COPAYNI-19, 20 y 21).
 *
 * - Los OTP y los refresh tokens se guardan solo como hash: la base nunca tiene un código ni un
 *   token utilizable.
 * - Las membresías pasan a referenciar usuarios reales.
 */
export class CreateAuth1761739200000 implements MigrationInterface {
  name = 'CreateAuth1761739200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(254) UNIQUE CHECK (email = lower(email)),
        phone varchar(16) UNIQUE CHECK (phone ~ '^\\+[1-9][0-9]{7,14}$'),
        status varchar(32) NOT NULL CHECK (status IN ('pending_verification', 'active')),
        preferred_language varchar(35),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_users_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE auth_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        channel varchar(8) NOT NULL CHECK (channel IN ('email', 'sms')),
        code_hash char(64) NOT NULL,
        status varchar(16) NOT NULL CHECK (status IN ('pending', 'locked', 'verified')),
        attempts_remaining smallint NOT NULL CHECK (attempts_remaining >= 0),
        resends_remaining smallint NOT NULL CHECK (resends_remaining >= 0),
        expires_at timestamptz NOT NULL,
        resend_available_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_auth_challenges_user_created ON auth_challenges (user_id, created_at)',
    );
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id uuid NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id)');
    await queryRunner.query(`
      ALTER TABLE circle_memberships
        ADD CONSTRAINT fk_circle_memberships_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE circle_memberships DROP CONSTRAINT fk_circle_memberships_user',
    );
    await queryRunner.query('DROP TABLE refresh_tokens');
    await queryRunner.query('DROP TABLE auth_challenges');
    await queryRunner.query('DROP TABLE users');
  }
}
