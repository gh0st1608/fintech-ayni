import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Cuentas de cobro del payout (COPAYNI-81), registradas por el personal. El CCI o el celular se
 * guardan cifrados (AES-256-GCM) y solo los 4 últimos dígitos en claro. Nunca se borran: una cuenta
 * nueva marca la anterior como reemplazada, y solo puede haber una vigente por persona.
 */
export class CreatePayoutAccounts1763812800000 implements MigrationInterface {
  name = 'CreatePayoutAccounts1763812800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payout_accounts (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        kind varchar(16) NOT NULL CHECK (kind IN ('bank_account', 'wallet')),
        bank_code varchar(3) CHECK (bank_code ~ '^[0-9]{3}$'),
        account_type varchar(16) CHECK (account_type IN ('savings', 'checking')),
        wallet_provider varchar(8) CHECK (wallet_provider IN ('yape', 'plin')),
        number_encrypted text NOT NULL,
        number_last4 varchar(4) NOT NULL CHECK (number_last4 ~ '^[0-9]{4}$'),
        holder_name varchar(160) NOT NULL,
        registered_by varchar(128) NOT NULL,
        registered_by_email varchar(254),
        reason varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        replaced_at timestamptz,
        CONSTRAINT ck_payout_accounts_kind CHECK (
          (kind = 'bank_account' AND bank_code IS NOT NULL AND account_type IS NOT NULL
             AND wallet_provider IS NULL)
          OR (kind = 'wallet' AND wallet_provider IS NOT NULL AND bank_code IS NULL
             AND account_type IS NULL)
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_payout_accounts_user ON payout_accounts (user_id, created_at DESC)',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_payout_accounts_current ON payout_accounts (user_id)
        WHERE replaced_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE payout_accounts');
  }
}
