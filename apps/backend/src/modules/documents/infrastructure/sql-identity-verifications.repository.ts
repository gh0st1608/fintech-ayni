import { type DataSource } from 'typeorm';

import {
  isUuid,
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../shared/infrastructure/persistence/postgres-errors';
import {
  type IdentitySubject,
  type IdentityVerification,
  type IdentityVerificationRepositoryPort,
  type NewIdentityVerification,
} from '../application/identity-verification.ports';
import {
  COUNTED_REJECTIONS,
  type DocumentCheck,
  type IdentityDecision,
  type IdentityRejectionReason,
  type IdentityVerificationStatus,
} from '../domain/identity-verification';

interface VerificationRow {
  id: string;
  user_id: string;
  document_number: string;
  status: IdentityVerificationStatus;
  reason: IdentityRejectionReason | null;
  document_check: DocumentCheck;
  provider_session_id: string | null;
  verification_url: string | null;
  created_at: Date;
  decided_at: Date | null;
}

const COLUMNS = `id, user_id, document_number, status, reason, document_check, provider_session_id,
  verification_url, created_at, decided_at`;

const toVerification = (row: VerificationRow): IdentityVerification => ({
  id: row.id,
  userId: row.user_id,
  documentNumber: row.document_number,
  status: row.status,
  reason: row.reason,
  documentCheck: row.document_check,
  providerSessionId: row.provider_session_id,
  verificationUrl: row.verification_url,
  createdAt: new Date(row.created_at),
  decidedAt: row.decided_at ? new Date(row.decided_at) : null,
});

const isDecided = (decision: IdentityDecision): boolean =>
  decision.status === 'approved' || decision.status === 'rejected';

const OPEN_INDEX = 'ux_identity_verifications_open';
const DOCUMENT_INDEX = 'ux_identity_verifications_document';

/**
 * Verificaciones de identidad sobre PostgreSQL (`identity_verifications`). `provider` es el
 * proveedor configurado (`KYC_PROVIDER`), que queda registrado en cada verificación.
 */
export class SqlIdentityVerificationsRepository implements IdentityVerificationRepositoryPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly provider: string,
  ) {}

  async subject(userId: string): Promise<IdentitySubject | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<
      { email: string | null; first_name: string | null; last_name: string | null }[]
    >('SELECT email, first_name, last_name FROM users WHERE id = $1', [userId]);
    return row ? { email: row.email, firstName: row.first_name, lastName: row.last_name } : null;
  }

  async latest(userId: string): Promise<IdentityVerification | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<VerificationRow[]>(
      `SELECT ${COLUMNS} FROM identity_verifications WHERE user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    return row ? toVerification(row) : null;
  }

  async countedRejections(userId: string): Promise<number> {
    if (!isUuid(userId)) return 0;
    const [row] = await this.dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM identity_verifications
        WHERE user_id = $1 AND status = 'rejected' AND reason = ANY($2)`,
      [userId, COUNTED_REJECTIONS],
    );
    return Number(row?.count ?? 0);
  }

  async verifiedByOther(userId: string, documentNumber: string): Promise<boolean> {
    const [row] = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM identity_verifications
        WHERE document_type = 'dni' AND document_number = $1 AND status = 'approved'
          AND user_id <> $2 LIMIT 1`,
      [documentNumber, userId],
    );
    return row !== undefined;
  }

  async create(verification: NewIdentityVerification): Promise<IdentityVerification> {
    try {
      const [row] = await this.dataSource.query<VerificationRow[]>(
        `INSERT INTO identity_verifications (id, user_id, document_number, status, reason,
                                             document_check, provider, provider_session_id,
                                             verification_url, consent_version, consented_at,
                                             decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), CASE WHEN $11 THEN now() END)
         RETURNING ${COLUMNS}`,
        [
          verification.id,
          verification.userId,
          verification.documentNumber,
          verification.decision.status,
          verification.decision.reason,
          verification.documentCheck,
          this.provider,
          verification.providerSessionId,
          verification.verificationUrl,
          verification.consentVersion,
          isDecided(verification.decision),
        ],
      );
      return toVerification(row!);
    } catch (error) {
      // Dos inicios a la vez: gana el primero y el otro recibe esa verificación.
      if (violatedConstraint(error, PG_UNIQUE_VIOLATION) === OPEN_INDEX) {
        const latest = await this.latest(verification.userId);
        if (latest) return latest;
      }
      throw error;
    }
  }

  async findBySession(providerSessionId: string): Promise<IdentityVerification | null> {
    const [row] = await this.dataSource.query<VerificationRow[]>(
      `SELECT ${COLUMNS} FROM identity_verifications WHERE provider_session_id = $1`,
      [providerSessionId],
    );
    return row ? toVerification(row) : null;
  }

  async decide(id: string, decision: IdentityDecision): Promise<IdentityVerification> {
    try {
      return await this.update(id, decision);
    } catch (error) {
      // Otra cuenta aprobó el mismo DNI antes: esta no puede quedar aprobada.
      if (violatedConstraint(error, PG_UNIQUE_VIOLATION) === DOCUMENT_INDEX) {
        return this.update(id, { status: 'rejected', reason: 'document_in_use' });
      }
      throw error;
    }
  }

  private async update(id: string, decision: IdentityDecision): Promise<IdentityVerification> {
    const [rows] = await this.dataSource.query<[VerificationRow[], number]>(
      `UPDATE identity_verifications
          SET status = $2, reason = $3,
              decided_at = CASE WHEN $4 THEN now() END,
              verification_url = CASE WHEN $5 THEN verification_url END
        WHERE id = $1 AND status IN ('in_progress', 'in_review')
        RETURNING ${COLUMNS}`,
      [
        id,
        decision.status,
        decision.reason,
        isDecided(decision),
        // El enlace del flujo solo sirve mientras la sesión sigue en curso.
        decision.status === 'in_progress',
      ],
    );
    const [updated] = rows;
    if (updated) return toVerification(updated);
    // Ya estaba resuelta (p. ej. el webhook y la app a la vez): se devuelve como quedó.
    const [row] = await this.dataSource.query<VerificationRow[]>(
      `SELECT ${COLUMNS} FROM identity_verifications WHERE id = $1`,
      [id],
    );
    return toVerification(row!);
  }
}
