import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Información personal (COPAYNI-45): nombre y apellido, y el cambio de email o teléfono pendiente
 * de verificar por OTP (supuesto R9). El desafío OTP es el de auth; aquí se guarda a qué dato
 * cambia.
 */
export class AddPersonalInfo1762776000000 implements MigrationInterface {
  name = 'AddPersonalInfo1762776000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN first_name varchar(80), ADD COLUMN last_name varchar(80)',
    );
    await queryRunner.query(`
      CREATE TABLE contact_change_requests (
        challenge_id uuid PRIMARY KEY REFERENCES auth_challenges (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type varchar(8) NOT NULL CHECK (type IN ('email', 'phone')),
        value varchar(254) NOT NULL,
        applied_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE contact_change_requests');
    await queryRunner.query('ALTER TABLE users DROP COLUMN first_name, DROP COLUMN last_name');
  }
}
