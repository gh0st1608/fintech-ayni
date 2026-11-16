import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { isUuid } from '../../../shared/infrastructure/persistence/postgres-errors';
import { type SignatureChallengeRepositoryPort } from '../application/ports';
import { SignatureChallenge, type SignatureChallengeStatus } from '../domain/signature-challenge';

interface ChallengeRow {
  id: string;
  agreement_id: string;
  code_hash: string;
  status: SignatureChallengeStatus;
  attempts_remaining: number;
  resends_remaining: number;
  expires_at: Date;
  resend_available_at: Date;
  created_at: Date;
}

const COLUMNS = `id, agreement_id, code_hash, status, attempts_remaining, resends_remaining,
  expires_at, resend_available_at, created_at`;

const restore = (row: ChallengeRow): SignatureChallenge =>
  SignatureChallenge.restore({
    id: row.id,
    agreementId: row.agreement_id,
    codeHash: row.code_hash,
    status: row.status,
    attemptsRemaining: row.attempts_remaining,
    resendsRemaining: row.resends_remaining,
    expiresAt: new Date(row.expires_at),
    resendAvailableAt: new Date(row.resend_available_at),
    createdAt: new Date(row.created_at),
  });

/** Desafíos de firma sobre PostgreSQL (COPAYNI-89). */
@Injectable()
export class SqlSignatureChallengesRepository implements SignatureChallengeRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(challenge: SignatureChallenge): Promise<void> {
    const state = challenge.snapshot;
    await this.dataSource.query(
      `INSERT INTO agreement_signature_challenges (id, agreement_id, code_hash, status,
                                                    attempts_remaining, resends_remaining,
                                                    expires_at, resend_available_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        state.id,
        state.agreementId,
        state.codeHash,
        state.status,
        state.attemptsRemaining,
        state.resendsRemaining,
        state.expiresAt,
        state.resendAvailableAt,
        state.createdAt,
      ],
    );
  }

  async latestFor(agreementId: string): Promise<SignatureChallenge | null> {
    if (!isUuid(agreementId)) return null;
    const [row] = await this.dataSource.query<ChallengeRow[]>(
      `SELECT ${COLUMNS} FROM agreement_signature_challenges WHERE agreement_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [agreementId],
    );
    return row ? restore(row) : null;
  }

  async update<T>(id: string, change: (challenge: SignatureChallenge) => T): Promise<T | null> {
    if (!isUuid(id)) return null;
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // SELECT … FOR UPDATE: los intentos simultáneos sobre el mismo desafío se serializan.
      const [row] = await manager.query<ChallengeRow[]>(
        `SELECT ${COLUMNS} FROM agreement_signature_challenges WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!row) return null;
      const challenge = restore(row);
      const result = change(challenge);
      const state = challenge.snapshot;
      await manager.query(
        `UPDATE agreement_signature_challenges
            SET code_hash = $2, status = $3, attempts_remaining = $4, resends_remaining = $5,
                expires_at = $6, resend_available_at = $7
          WHERE id = $1`,
        [
          id,
          state.codeHash,
          state.status,
          state.attemptsRemaining,
          state.resendsRemaining,
          state.expiresAt,
          state.resendAvailableAt,
        ],
      );
      return result;
    });
  }
}
