import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Referidos (COPAYNI-51): el código de cada usuario y quién invitó a quién, con el beneficio
 * congelado al usar el código. Un usuario usa un solo código.
 */
export class CreateReferrals1762862400000 implements MigrationInterface {
  name = 'CreateReferrals1762862400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE referral_codes (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        code char(8) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE referrals (
        invitee_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        inviter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        reward_amount bigint NOT NULL CHECK (reward_amount >= 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        claimed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_referrals_not_self CHECK (invitee_id <> inviter_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_referrals_inviter ON referrals (inviter_id, claimed_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE referrals');
    await queryRunner.query('DROP TABLE referral_codes');
  }
}
