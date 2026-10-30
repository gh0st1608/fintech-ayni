import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../shared/domain/value-objects/money';
import { isUuid } from '../../../shared/infrastructure/persistence/postgres-errors';
import {
  type DocumentRepositoryPort,
  type KycStatusPort,
  type StoredDocument,
  type Upload,
  type VerificationResult,
} from '../application/ports';
import { type DocumentStatus, type DocumentType, UploadNotUsableError } from '../domain/document';

interface DocumentRow {
  id: string;
  type: DocumentType;
  kind: string;
  status: DocumentStatus;
  reason: string | null;
  monthly_income_amount: string | null;
  currency: string | null;
  pages: number;
  submitted_at: Date;
  reviewed_at: Date | null;
}

const toDocument = (row: DocumentRow): StoredDocument => ({
  id: row.id,
  type: row.type,
  kind: row.kind,
  status: row.status,
  reason: row.reason,
  monthlyIncome:
    row.monthly_income_amount === null
      ? null
      : Money.of(Number(row.monthly_income_amount), row.currency!),
  pages: row.pages,
  submittedAt: new Date(row.submitted_at),
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
});

const COLUMNS = `d.id, d.type, d.kind, d.status, d.reason, d.monthly_income_amount::text AS monthly_income_amount,
  d.currency, d.pages, d.submitted_at, d.reviewed_at`;

/** Documentos KYC sobre PostgreSQL (`document_uploads` y `kyc_documents`). */
@Injectable()
export class SqlDocumentsRepository implements DocumentRepositoryPort, KycStatusPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createUpload(upload: Omit<Upload, 'usedAt'>): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO document_uploads (id, user_id, purpose, storage_key, size_bytes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        upload.id,
        upload.userId,
        upload.purpose,
        upload.storageKey,
        upload.sizeBytes,
        upload.expiresAt,
      ],
    );
  }

  async upload(id: string): Promise<Upload | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.dataSource.query<
      {
        id: string;
        user_id: string;
        purpose: Upload['purpose'];
        storage_key: string;
        size_bytes: number;
        expires_at: Date;
        used_at: Date | null;
      }[]
    >(
      `SELECT id, user_id, purpose, storage_key, size_bytes, expires_at, used_at
         FROM document_uploads WHERE id = $1`,
      [id],
    );
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          purpose: row.purpose,
          storageKey: row.storage_key,
          sizeBytes: row.size_bytes,
          expiresAt: new Date(row.expires_at),
          usedAt: row.used_at ? new Date(row.used_at) : null,
        }
      : null;
  }

  submit(props: {
    userId: string;
    type: DocumentType;
    kind: string;
    uploadIds: string[];
    monthlyIncome: Money | null;
    result: VerificationResult;
  }): Promise<StoredDocument> {
    return this.dataSource.transaction(async (manager) => {
      for (const uploadId of props.uploadIds) {
        const [, used] = await manager.query<[unknown, number]>(
          `UPDATE document_uploads SET used_at = now()
            WHERE id = $1 AND user_id = $2 AND used_at IS NULL`,
          [uploadId, props.userId],
        );
        if (used !== 1) throw new UploadNotUsableError(uploadId);
      }
      const reviewed = props.result.status !== 'in_review';
      const [row] = await manager.query<DocumentRow[]>(
        `INSERT INTO kyc_documents AS d (id, user_id, type, kind, status, reason,
                                         monthly_income_amount, currency, pages, upload_ids,
                                         reviewed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid[],
                 CASE WHEN $10 THEN now() END)
         RETURNING ${COLUMNS}`,
        [
          props.userId,
          props.type,
          props.kind,
          props.result.status,
          props.result.reason,
          props.monthlyIncome?.amount ?? null,
          props.monthlyIncome?.currency ?? null,
          props.uploadIds.length,
          props.uploadIds,
          reviewed,
        ],
      );
      return toDocument(row!);
    });
  }

  async list(userId: string): Promise<StoredDocument[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.dataSource.query<DocumentRow[]>(
      `SELECT ${COLUMNS} FROM kyc_documents d WHERE d.user_id = $1
        ORDER BY d.submitted_at DESC, d.id DESC`,
      [userId],
    );
    return rows.map(toDocument);
  }

  async identityVerified(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const [row] = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM kyc_documents
        WHERE user_id = $1 AND type = 'national_id' AND status = 'approved' LIMIT 1`,
      [userId],
    );
    return row !== undefined;
  }

  async approvedMonthlyIncome(userId: string): Promise<Money | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<{ amount: string; currency: string }[]>(
      `SELECT monthly_income_amount::text AS amount, currency FROM kyc_documents
        WHERE user_id = $1 AND type = 'proof_of_income' AND status = 'approved'
        ORDER BY reviewed_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    return row ? Money.of(Number(row.amount), row.currency) : null;
  }
}
