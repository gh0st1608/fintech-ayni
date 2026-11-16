import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Firma del contrato y del pagaré al unirse a un Game'ya (COPAYNI-89, pending-scope D3):
 * - `membership_agreements`: los dos documentos de una unión. Guarda el texto canónico renderizado
 *   con los datos del turno, su versión y su hash: la evidencia es el texto exacto que se mostró y
 *   se firmó, no una plantilla que puede cambiar después. `pending` hasta firmar; vencido el plazo
 *   (48 h), pasa a `expired` y el turno se libera.
 * - `agreement_signatures`: la evidencia, de solo inserción como la auditoría. Repite los hashes a
 *   propósito: queda congelado qué se firmó aunque la plantilla cambie después.
 * - `agreement_signature_challenges`: el código que firma los dos documentos a la vez.
 */
export class CreateMembershipAgreements1764504000000 implements MigrationInterface {
  name = 'CreateMembershipAgreements1764504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE membership_agreements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        position integer NOT NULL CHECK (position >= 1),
        contract_version varchar(100) NOT NULL,
        contract_text text NOT NULL,
        contract_hash char(64) NOT NULL,
        note_version varchar(100) NOT NULL,
        note_text text NOT NULL,
        note_hash char(64) NOT NULL,
        contract_read_at timestamptz,
        note_read_at timestamptz,
        status varchar(20) NOT NULL CHECK (status IN ('pending', 'signed', 'expired')),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        signed_at timestamptz,
        CONSTRAINT uq_membership_agreements_member UNIQUE (circle_id, user_id),
        CONSTRAINT ck_membership_agreements_signed
          CHECK ((status = 'signed') = (signed_at IS NOT NULL))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_membership_agreements_user ON membership_agreements (user_id, created_at DESC)',
    );
    // La tarea diaria busca los vencidos sin firmar: solo los pendientes importan.
    await queryRunner.query(`
      CREATE INDEX ix_membership_agreements_pending ON membership_agreements (expires_at)
        WHERE status = 'pending'
    `);

    await queryRunner.query(`
      CREATE TABLE agreement_signatures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id uuid NOT NULL UNIQUE REFERENCES membership_agreements (id) ON DELETE RESTRICT,
        signed_at timestamptz NOT NULL,
        ip varchar(45),
        user_agent varchar(500),
        contract_hash char(64) NOT NULL,
        note_hash char(64) NOT NULL
      )
    `);
    // Evidencia inmutable: ni el personal ni la aplicación la pueden cambiar (COPAYNI-89).
    await queryRunner.query(`
      CREATE TRIGGER tr_agreement_signatures_insert_only
        BEFORE UPDATE OR DELETE ON agreement_signatures
        FOR EACH ROW EXECUTE FUNCTION ledger_reject_change()
    `);
    await queryRunner.query(`
      CREATE TRIGGER tr_agreement_signatures_no_truncate
        BEFORE TRUNCATE ON agreement_signatures
        FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change()
    `);

    await queryRunner.query(`
      CREATE TABLE agreement_signature_challenges (
        id uuid PRIMARY KEY,
        agreement_id uuid NOT NULL REFERENCES membership_agreements (id) ON DELETE RESTRICT,
        code_hash varchar(255) NOT NULL,
        status varchar(20) NOT NULL CHECK (status IN ('pending', 'locked', 'consumed')),
        attempts_remaining integer NOT NULL CHECK (attempts_remaining >= 0),
        resends_remaining integer NOT NULL CHECK (resends_remaining >= 0),
        expires_at timestamptz NOT NULL,
        resend_available_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_agreement_challenges_agreement
        ON agreement_signature_challenges (agreement_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE agreement_signature_challenges');
    await queryRunner.query('DROP TABLE agreement_signatures');
    await queryRunner.query('DROP TABLE membership_agreements');
  }
}
