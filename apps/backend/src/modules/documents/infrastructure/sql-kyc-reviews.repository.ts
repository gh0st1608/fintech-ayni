import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../shared/errors/app-error';
import { isUuid } from '../../../shared/infrastructure/persistence/postgres-errors';
import {
  type KycDecision,
  type KycReviewDetail,
  type KycReviewPage,
  type KycReviewRepositoryPort,
  type KycReviewsFilter,
  type KycReviewsPage,
  type KycReviewSummary,
} from '../application/kyc-review.ports';
import { type DocumentStatus, type DocumentType, type UploadPurpose } from '../domain/document';

interface SummaryRow {
  id: string;
  type: DocumentType;
  kind: string;
  status: DocumentStatus;
  pages: number;
  monthly_income_amount: string | null;
  currency: string | null;
  submitted_at: Date;
  superseded: boolean;
  user_id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  sort_text: string;
}

interface DetailRow extends SummaryRow {
  reason: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
}

const COLUMNS = `
  d.id, d.type, d.kind, d.status, d.pages, d.monthly_income_amount::text AS monthly_income_amount,
  d.currency, d.submitted_at, d.reason, d.reviewed_at, d.reviewed_by,
  EXISTS (SELECT 1 FROM kyc_documents n
           WHERE n.user_id = d.user_id AND n.type = d.type
             AND (n.submitted_at, n.id) > (d.submitted_at, d.id)) AS superseded,
  u.id AS user_id, u.email, u.phone, u.first_name, u.last_name`;

/** Fecha con microsegundos en UTC: el cursor tiene que reproducir el orden exacto. */
const sortText = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_text`;

function encodeCursor(row: { id: string; sort_text: string }): string {
  return Buffer.from(`${row.sort_text}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!at || !id || !isUuid(id) || Number.isNaN(Date.parse(at))) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { at, id };
}

const toSummary = (row: SummaryRow): KycReviewSummary => ({
  id: row.id,
  type: row.type,
  kind: row.kind,
  status: row.status,
  pages: row.pages,
  monthlyIncome:
    row.monthly_income_amount === null || row.currency === null
      ? null
      : Money.of(Number(row.monthly_income_amount), row.currency.trim()),
  submittedAt: new Date(row.submitted_at),
  superseded: row.superseded,
  subject: {
    userId: row.user_id,
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
  },
});

/** Revisión manual del KYC desde el back-office, sobre `kyc_documents` y `document_uploads`. */
@Injectable()
export class SqlKycReviewsRepository implements KycReviewRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list({ status, type, limit, cursor }: KycReviewsFilter): Promise<KycReviewsPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    // La cola va por antigüedad (la más vieja espera más); lo revisado, por lo más reciente.
    const pending = status === 'in_review';
    const sortColumn = pending ? 'd.submitted_at' : 'd.reviewed_at';
    const rows = await this.dataSource.query<SummaryRow[]>(
      `SELECT ${COLUMNS}, ${sortText(sortColumn)}
         FROM kyc_documents d JOIN users u ON u.id = d.user_id
        WHERE d.status = $1
          AND ($2::text IS NULL OR d.type = $2)
          AND ($3::timestamptz IS NULL
               OR (${sortColumn}, d.id) ${pending ? '>' : '<'} ($3::timestamptz, $4::uuid))
        ORDER BY ${sortColumn} ${pending ? 'ASC' : 'DESC'}, d.id ${pending ? 'ASC' : 'DESC'}
        LIMIT $5`,
      [status, type ?? null, after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
    };
  }

  async find(id: string): Promise<KycReviewDetail | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.dataSource.query<DetailRow[]>(
      `SELECT ${COLUMNS}, ${sortText('d.submitted_at')}
         FROM kyc_documents d JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [id],
    );
    if (!row) return null;
    const pages = await this.dataSource.query<
      { page: number; purpose: UploadPurpose; size_bytes: number; storage_key: string }[]
    >(
      `SELECT p.ord::int AS page, up.purpose, up.size_bytes, up.storage_key
         FROM kyc_documents d
         CROSS JOIN LATERAL unnest(d.upload_ids) WITH ORDINALITY AS p(upload_id, ord)
         JOIN document_uploads up ON up.id = p.upload_id
        WHERE d.id = $1
        ORDER BY p.ord`,
      [id],
    );
    return {
      ...toSummary(row),
      reason: row.reason,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
      reviewedBy: row.reviewed_by,
      pageFiles: pages.map((page): KycReviewPage => ({
        page: page.page,
        purpose: page.purpose,
        sizeBytes: page.size_bytes,
        storageKey: page.storage_key,
      })),
    };
  }

  async decide(props: {
    id: string;
    decision: KycDecision;
    reasonText: string | null;
    reviewedBy: string;
  }): Promise<{ decided: true } | { decided: false; status: DocumentStatus } | null> {
    if (!isUuid(props.id)) return null;
    const income =
      props.decision.status === 'approved' ? (props.decision.monthlyIncome?.amount ?? null) : null;
    // Con UPDATE, el driver devuelve [filas, cantidad de filas afectadas].
    const [, updated] = await this.dataSource.query<[unknown, number]>(
      `UPDATE kyc_documents
          SET status = $2, reason = $3, reviewed_at = now(), reviewed_by = $4,
              monthly_income_amount = COALESCE($5, monthly_income_amount)
        WHERE id = $1 AND status = 'in_review'
        RETURNING id`,
      [props.id, props.decision.status, props.reasonText, props.reviewedBy, income],
    );
    if (updated === 1) return { decided: true };
    const [current] = await this.dataSource.query<{ status: DocumentStatus }[]>(
      'SELECT status FROM kyc_documents WHERE id = $1',
      [props.id],
    );
    return current ? { decided: false, status: current.status } : null;
  }
}
