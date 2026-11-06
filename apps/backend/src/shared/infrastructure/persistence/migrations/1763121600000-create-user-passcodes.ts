import { type MigrationInterface, type QueryRunner } from 'typeorm';

/** Passcode de acceso (COPAYNI-23): solo el hash, nunca el valor. */
export class CreateUserPasscodes1763121600000 implements MigrationInterface {
  name = 'CreateUserPasscodes1763121600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_passcodes (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        hash varchar(200) NOT NULL,
        failed_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE user_passcodes');
  }
}
