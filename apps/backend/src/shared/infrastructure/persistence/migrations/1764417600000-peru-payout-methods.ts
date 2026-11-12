import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Métodos de cobro de Perú (COPAYNI-95): `bank_transfer` pasa a `bank_account` y `digital_wallet`
 * a `wallet`. La tarjeta prepago y Fawry (del Figma de Marruecos) no existen en Perú: quien los
 * eligió vuelve a elegir método antes de unirse a otra junta.
 */
export class PeruPayoutMethods1764417600000 implements MigrationInterface {
  name = 'PeruPayoutMethods1764417600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropMethodCheck(queryRunner);
    await queryRunner.query(`
      UPDATE user_payout_methods
         SET method = CASE method WHEN 'bank_transfer' THEN 'bank_account' ELSE 'wallet' END,
             updated_at = now()
       WHERE method IN ('bank_transfer', 'digital_wallet')
    `);
    await queryRunner.query(
      `DELETE FROM user_payout_methods WHERE method IN ('prepaid_card', 'fawry')`,
    );
    await queryRunner.query(`
      ALTER TABLE user_payout_methods ADD CONSTRAINT ck_user_payout_methods_method
        CHECK (method IN ('bank_account', 'wallet'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE user_payout_methods DROP CONSTRAINT ck_user_payout_methods_method',
    );
    await queryRunner.query(`
      UPDATE user_payout_methods
         SET method = CASE method WHEN 'bank_account' THEN 'bank_transfer' ELSE 'digital_wallet' END
    `);
    await queryRunner.query(`
      ALTER TABLE user_payout_methods ADD CONSTRAINT user_payout_methods_method_check
        CHECK (method IN ('digital_wallet', 'prepaid_card', 'bank_transfer', 'fawry'))
    `);
  }

  /** El CHECK original no tiene nombre explícito: se busca por la columna. */
  private async dropMethodCheck(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT c.conname AS name FROM pg_constraint c
       WHERE c.conrelid = 'user_payout_methods'::regclass AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%method%'
    `)) as { name: string }[];
    for (const { name } of rows) {
      await queryRunner.query(`ALTER TABLE user_payout_methods DROP CONSTRAINT "${name}"`);
    }
  }
}
