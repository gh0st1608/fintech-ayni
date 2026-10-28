import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Idempotencia de la unión por usuario (COPAYNI-31). Al unirse a un círculo nuevo todavía no
 * hay círculo, así que la clave se reconoce por (usuario, clave) en cualquier círculo: dos
 * envíos del mismo pedido no crean dos círculos.
 */
export class AddJoinIdempotency1761912000000 implements MigrationInterface {
  name = 'AddJoinIdempotency1761912000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_memberships
        ADD CONSTRAINT uq_circle_memberships_user_idempotency_key UNIQUE (user_id, idempotency_key)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE circle_memberships DROP CONSTRAINT uq_circle_memberships_user_idempotency_key',
    );
  }
}
