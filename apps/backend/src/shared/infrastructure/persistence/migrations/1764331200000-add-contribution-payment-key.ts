import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Clave con que se pagó un aporte desde la app (COPAYNI-93): repetir el mismo pago devuelve el
 * plan sin cobrar el aporte siguiente. Única por suscripción.
 */
export class AddContributionPaymentKey1764331200000 implements MigrationInterface {
  name = 'AddContributionPaymentKey1764331200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE saving_contributions ADD COLUMN payment_key varchar(255)');
    await queryRunner.query(
      `CREATE UNIQUE INDEX ux_saving_contributions_payment_key
         ON saving_contributions (subscription_id, payment_key) WHERE payment_key IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE saving_contributions DROP COLUMN payment_key');
  }
}
