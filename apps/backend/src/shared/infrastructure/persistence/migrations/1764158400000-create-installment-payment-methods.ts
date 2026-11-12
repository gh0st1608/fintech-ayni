import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Con qué se pagó cada cuota, enmascarado (COPAYNI-80): lo muestra el comprobante. Solo la marca o
 * "Yape" y 4 dígitos; nunca el número completo de la tarjeta ni del celular.
 */
export class CreateInstallmentPaymentMethods1764158400000 implements MigrationInterface {
  name = 'CreateInstallmentPaymentMethods1764158400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE installment_payment_methods (
        installment_id uuid PRIMARY KEY REFERENCES circle_installments (id) ON DELETE RESTRICT,
        label varchar(40) NOT NULL CHECK (label ~ '[0-9]{4}$'),
        recorded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE installment_payment_methods');
  }
}
