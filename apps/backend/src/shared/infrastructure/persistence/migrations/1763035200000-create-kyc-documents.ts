import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Documentos KYC (COPAYNI-43, 47 a 49): las subidas con URL prefirmada y los documentos enviados
 * a revisión. Los archivos viven en el almacenamiento privado; aquí solo su clave y el estado.
 * La retención y el borrado dependen de Legal (L5).
 */
export class CreateKycDocuments1763035200000 implements MigrationInterface {
  name = 'CreateKycDocuments1763035200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE document_uploads (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        purpose varchar(24) NOT NULL
          CHECK (purpose IN ('national_id_front', 'national_id_back', 'proof_of_income', 'additional')),
        storage_key varchar(255) NOT NULL UNIQUE,
        size_bytes integer NOT NULL CHECK (size_bytes > 0),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE kyc_documents (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        type varchar(24) NOT NULL CHECK (type IN ('national_id', 'proof_of_income', 'additional')),
        kind varchar(24) NOT NULL,
        status varchar(16) NOT NULL CHECK (status IN ('in_review', 'approved', 'rejected')),
        reason text,
        monthly_income_amount bigint CHECK (monthly_income_amount > 0),
        currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
        pages smallint NOT NULL CHECK (pages > 0),
        upload_ids uuid[] NOT NULL,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz,
        CONSTRAINT ck_kyc_documents_income
          CHECK ((type = 'proof_of_income') = (monthly_income_amount IS NOT NULL))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_kyc_documents_user ON kyc_documents (user_id, type, submitted_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE kyc_documents');
    await queryRunner.query('DROP TABLE document_uploads');
  }
}
