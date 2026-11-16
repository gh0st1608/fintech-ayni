import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { isUuid } from '../../../shared/infrastructure/persistence/postgres-errors';
import {
  type AgreementRepositoryPort,
  type ExpiredMembership,
  type NewAgreement,
  type SignatureEvidence,
} from '../application/ports';
import {
  type AgreementDocument,
  type AgreementStatus,
  type MembershipAgreement,
} from '../domain/agreement';

interface AgreementRow {
  id: string;
  user_id: string;
  circle_id: string;
  position: number;
  contract_version: string;
  contract_text: string;
  contract_hash: string;
  note_version: string;
  note_text: string;
  note_hash: string;
  contract_read_at: Date | null;
  note_read_at: Date | null;
  status: AgreementStatus;
  created_at: Date;
  expires_at: Date;
  signed_at: Date | null;
}

const COLUMNS = `id, user_id, circle_id, position, contract_version, contract_text, contract_hash,
  note_version, note_text, note_hash, contract_read_at, note_read_at, status, created_at,
  expires_at, signed_at`;

const toAgreement = (row: AgreementRow): MembershipAgreement => ({
  id: row.id,
  userId: row.user_id,
  circleId: row.circle_id,
  position: row.position,
  contract: {
    version: row.contract_version,
    text: row.contract_text,
    hash: row.contract_hash,
    readAt: row.contract_read_at ? new Date(row.contract_read_at) : null,
  },
  promissoryNote: {
    version: row.note_version,
    text: row.note_text,
    hash: row.note_hash,
    readAt: row.note_read_at ? new Date(row.note_read_at) : null,
  },
  status: row.status,
  createdAt: new Date(row.created_at),
  expiresAt: new Date(row.expires_at),
  signedAt: row.signed_at ? new Date(row.signed_at) : null,
});

/** Columna de lectura de cada documento. */
const READ_COLUMN: Record<AgreementDocument, string> = {
  contract: 'contract_read_at',
  promissory_note: 'note_read_at',
};

/** Acuerdos de firma sobre PostgreSQL (COPAYNI-89). */
@Injectable()
export class SqlAgreementsRepository implements AgreementRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(agreement: NewAgreement): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO membership_agreements (id, user_id, circle_id, position, contract_version,
                                          contract_text, contract_hash, note_version, note_text,
                                          note_hash, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
       ON CONFLICT ON CONSTRAINT uq_membership_agreements_member DO NOTHING`,
      [
        agreement.id,
        agreement.userId,
        agreement.circleId,
        agreement.position,
        agreement.contractVersion,
        agreement.contractText,
        agreement.contractHash,
        agreement.promissoryNoteVersion,
        agreement.promissoryNoteText,
        agreement.promissoryNoteHash,
        agreement.createdAt,
        agreement.expiresAt,
      ],
    );
  }

  async byId(id: string): Promise<MembershipAgreement | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.dataSource.query<AgreementRow[]>(
      `SELECT ${COLUMNS} FROM membership_agreements WHERE id = $1`,
      [id],
    );
    return row ? toAgreement(row) : null;
  }

  async listFor(userId: string): Promise<MembershipAgreement[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.dataSource.query<AgreementRow[]>(
      `SELECT ${COLUMNS} FROM membership_agreements WHERE user_id = $1
        ORDER BY created_at DESC, id DESC`,
      [userId],
    );
    return rows.map(toAgreement);
  }

  async find(userId: string, circleId: string): Promise<MembershipAgreement | null> {
    if (!isUuid(userId) || !isUuid(circleId)) return null;
    const [row] = await this.dataSource.query<AgreementRow[]>(
      `SELECT ${COLUMNS} FROM membership_agreements WHERE user_id = $1 AND circle_id = $2`,
      [userId, circleId],
    );
    return row ? toAgreement(row) : null;
  }

  async hasUnsigned(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const [row] = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM membership_agreements WHERE user_id = $1 AND status <> 'signed' LIMIT 1`,
      [userId],
    );
    return row !== undefined;
  }

  async markRead(id: string, document: AgreementDocument, now: Date): Promise<void> {
    if (!isUuid(id)) return;
    const column = READ_COLUMN[document];
    await this.dataSource.query(
      `UPDATE membership_agreements SET ${column} = $2
        WHERE id = $1 AND ${column} IS NULL`,
      [id, now],
    );
  }

  /**
   * Firma los dos documentos y escribe la evidencia en una transacción. El UPDATE condicionado a
   * `pending` y al plazo es la barrera final: dos solicitudes simultáneas no pueden firmar dos
   * veces, y la evidencia es de solo inserción.
   */
  sign(id: string, evidence: SignatureEvidence): Promise<boolean> {
    if (!isUuid(id)) return Promise.resolve(false);
    return this.dataSource.transaction(async (manager) => {
      const [, updated] = await manager.query<[unknown, number]>(
        `UPDATE membership_agreements SET status = 'signed', signed_at = $2
          WHERE id = $1 AND status = 'pending' AND expires_at > $2`,
        [id, evidence.signedAt],
      );
      if (updated !== 1) return false;
      await manager.query(
        `INSERT INTO agreement_signatures (agreement_id, signed_at, ip, user_agent,
                                            contract_hash, note_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          evidence.signedAt,
          evidence.ip,
          evidence.userAgent,
          evidence.contractHash,
          evidence.promissoryNoteHash,
        ],
      );
      return true;
    });
  }

  async expire(now: Date): Promise<ExpiredMembership[]> {
    // UPDATE … RETURNING devuelve [filas, afectadas]: hay que quedarse con las filas.
    const [rows] = await this.dataSource.query<
      [{ id: string; user_id: string; circle_id: string; position: number }[], number]
    >(
      `UPDATE membership_agreements SET status = 'expired'
        WHERE status = 'pending' AND expires_at <= $1
        RETURNING id, user_id, circle_id, position`,
      [now],
    );
    return rows.map((row) => ({
      agreementId: row.id,
      userId: row.user_id,
      circleId: row.circle_id,
      position: row.position,
    }));
  }
}
