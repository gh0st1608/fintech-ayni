import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Verificación de identidad con VerificaID (COPAYNI-42): validación documental (Consulta) y
 * sesión biométrica (CheckMatch). Guarda el DNI declarado para consultar el resultado y evitar
 * que un DNI quede verificado en dos cuentas; nunca imágenes ni datos biométricos, que quedan en
 * el proveedor. La retención depende de Legal (L3, L5).
 */
export class CreateIdentityVerifications1763726400000 implements MigrationInterface {
  name = 'CreateIdentityVerifications1763726400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE identity_verifications (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        document_type varchar(8) NOT NULL DEFAULT 'dni' CHECK (document_type IN ('dni')),
        document_number varchar(12) NOT NULL CHECK (document_number ~ '^[0-9]{8}$'),
        status varchar(16) NOT NULL
          CHECK (status IN ('in_progress', 'in_review', 'approved', 'rejected')),
        reason varchar(24),
        document_check varchar(16) NOT NULL
          CHECK (document_check IN ('matched', 'mismatch', 'not_found')),
        provider varchar(16) NOT NULL,
        provider_session_id varchar(64) UNIQUE,
        verification_url text,
        consent_version varchar(32) NOT NULL,
        consented_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        CONSTRAINT ck_identity_verifications_reason CHECK ((status = 'rejected') = (reason IS NOT NULL))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_identity_verifications_user ON identity_verifications (user_id, created_at)',
    );
    // Una sola verificación abierta por persona, y un DNI aprobado en una sola cuenta.
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_identity_verifications_open ON identity_verifications (user_id)
        WHERE status IN ('in_progress', 'in_review')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_identity_verifications_document ON identity_verifications
        (document_type, document_number) WHERE status = 'approved'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE identity_verifications');
  }
}
