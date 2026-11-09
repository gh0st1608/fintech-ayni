import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Revisión manual del KYC desde el back-office (docs/backoffice-plan.md, fase 2): quién resolvió
 * cada documento, y un índice para la cola por estado y antigüedad.
 */
export class AddKycReview1763467200000 implements MigrationInterface {
  name = 'AddKycReview1763467200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE kyc_documents ADD COLUMN reviewed_by varchar(255)');
    await queryRunner.query(
      'CREATE INDEX ix_kyc_documents_queue ON kyc_documents (status, submitted_at, id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_kyc_documents_queue');
    await queryRunner.query('ALTER TABLE kyc_documents DROP COLUMN reviewed_by');
  }
}
