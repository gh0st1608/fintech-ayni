import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Precio del slot congelado al unirse (COPAYNI-55): cuotas, fee, descuento, Admin Fees y payout
 * neto que aceptó el miembro. Las membresías anteriores quedan con `NULL` y se siguen cotizando
 * con las reglas vigentes, como hasta ahora: todavía no hay datos en producción que rellenar.
 */
export class AddMembershipPrice1761998400000 implements MigrationInterface {
  name = 'AddMembershipPrice1761998400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE circle_memberships ADD COLUMN price jsonb');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE circle_memberships DROP COLUMN price');
  }
}
