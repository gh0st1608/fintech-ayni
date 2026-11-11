import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Aceptación de los términos al unirse a un círculo (COPAYNI-86, diseño D2): la versión aceptada
 * y cuándo. Las membresías anteriores quedan sin ella.
 */
export class AddMembershipTermsAcceptance1763640000000 implements MigrationInterface {
  name = 'AddMembershipTermsAcceptance1763640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_memberships
        ADD COLUMN terms_version varchar(32),
        ADD COLUMN terms_accepted_at timestamptz,
        ADD CONSTRAINT ck_circle_memberships_terms_acceptance
          CHECK ((terms_version IS NULL) = (terms_accepted_at IS NULL))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circle_memberships
        DROP CONSTRAINT ck_circle_memberships_terms_acceptance,
        DROP COLUMN terms_accepted_at,
        DROP COLUMN terms_version
    `);
  }
}
