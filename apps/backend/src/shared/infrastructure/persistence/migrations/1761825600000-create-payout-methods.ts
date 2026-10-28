import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Método de cobro elegido por cada usuario (COPAYNI-37). Solo el tipo: los datos de la cuenta o
 * wallet llegan con "Add Account" (D4) y el proveedor (T5).
 */
export class CreatePayoutMethods1761825600000 implements MigrationInterface {
  name = 'CreatePayoutMethods1761825600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_payout_methods (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        method varchar(32) NOT NULL
          CHECK (method IN ('digital_wallet', 'prepaid_card', 'bank_transfer', 'fawry')),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE user_payout_methods');
  }
}
