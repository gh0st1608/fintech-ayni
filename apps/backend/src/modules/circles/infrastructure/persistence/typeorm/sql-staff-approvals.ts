import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ValidationError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type ApprovalsFilter,
  type StaffApprovalsPort,
} from '../../../application/ports/staff-approvals.port';
import {
  type ApprovalAction,
  type ApprovalStatus,
  type FundMovementProposal,
  type StaffActor,
  type StaffApproval,
} from '../../../domain/staff-approval';

interface ApprovalRow {
  id: string;
  action: ApprovalAction;
  payload: FundMovementProposal;
  status: Exclude<ApprovalStatus, 'expired'>;
  proposed_by: string;
  proposed_by_email: string | null;
  proposed_at: Date;
  proposed_at_text: string;
  expires_at: Date;
  decided_by: string | null;
  decided_by_email: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
}

const COLUMNS = `id, action, payload, status, proposed_by, proposed_by_email, proposed_at,
  to_char(proposed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS proposed_at_text,
  expires_at, decided_by, decided_by_email, decided_at, decision_reason`;

const actor = (staffId: string | null, email: string | null): StaffActor | null =>
  staffId === null ? null : { staffId, email };

const toApproval = (row: ApprovalRow): StaffApproval => ({
  id: row.id,
  action: row.action,
  payload: row.payload,
  status: row.status,
  proposedBy: { staffId: row.proposed_by, email: row.proposed_by_email },
  proposedAt: new Date(row.proposed_at),
  expiresAt: new Date(row.expires_at),
  decidedBy: actor(row.decided_by, row.decided_by_email),
  decidedAt: row.decided_at ? new Date(row.decided_at) : null,
  decisionReason: row.decision_reason,
});

/** El cursor es la fecha exacta de la última propuesta de la página y su id. */
const encodeCursor = (row: ApprovalRow): string =>
  Buffer.from(`${row.proposed_at_text}|${row.id}`).toString('base64url');

function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!at || !id || !isUuid(id) || Number.isNaN(Date.parse(at))) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { at, id };
}

@Injectable()
export class SqlStaffApprovals implements StaffApprovalsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(approval: StaffApproval): Promise<StaffApproval> {
    const rows = await this.dataSource.query<ApprovalRow[]>(
      `INSERT INTO staff_approvals (id, action, payload, status, proposed_by, proposed_by_email,
         proposed_at, expires_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        approval.id,
        approval.action,
        JSON.stringify(approval.payload),
        approval.proposedBy.staffId,
        approval.proposedBy.email,
        approval.proposedAt,
        approval.expiresAt,
      ],
    );
    return toApproval(rows[0]!);
  }

  async find(id: string): Promise<StaffApproval | null> {
    if (!isUuid(id)) return null;
    const rows = await this.dataSource.query<ApprovalRow[]>(
      `SELECT ${COLUMNS} FROM staff_approvals WHERE id = $1`,
      [id],
    );
    return rows[0] ? toApproval(rows[0]) : null;
  }

  async list(
    filter: ApprovalsFilter,
  ): Promise<{ items: StaffApproval[]; nextCursor: string | null }> {
    const params: unknown[] = [];
    const where: string[] = [];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    // `expired` no se guarda: es una pendiente cuyo plazo ya pasó.
    if (filter.status === 'expired') {
      where.push(`status = 'pending' AND expires_at <= ${param(filter.now)}`);
    } else if (filter.status === 'pending') {
      where.push(`status = 'pending' AND expires_at > ${param(filter.now)}`);
    } else if (filter.status) {
      where.push(`status = ${param(filter.status)}`);
    }
    if (filter.cursor) {
      const { at, id } = decodeCursor(filter.cursor);
      where.push(`(proposed_at, id) < (${param(at)}::timestamptz, ${param(id)}::uuid)`);
    }
    const rows = await this.dataSource.query<ApprovalRow[]>(
      `SELECT ${COLUMNS} FROM staff_approvals
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY proposed_at DESC, id DESC
        LIMIT ${param(filter.limit + 1)}`,
      params,
    );
    const items = rows.slice(0, filter.limit);
    return {
      items: items.map(toApproval),
      nextCursor: rows.length > filter.limit ? encodeCursor(items.at(-1)!) : null,
    };
  }

  async decide(props: {
    id: string;
    status: 'approved' | 'rejected';
    by: StaffActor;
    at: Date;
    reason: string | null;
  }): Promise<StaffApproval | null> {
    // Con UPDATE ... RETURNING, TypeORM devuelve [filas, filas afectadas].
    const [rows] = await this.dataSource.query<[ApprovalRow[], number]>(
      `UPDATE staff_approvals
          SET status = $2, decided_by = $3, decided_by_email = $4, decided_at = $5,
              decision_reason = $6
        WHERE id = $1 AND status = 'pending' AND expires_at > $5 AND proposed_by <> $3
        RETURNING ${COLUMNS}`,
      [props.id, props.status, props.by.staffId, props.by.email, props.at, props.reason],
    );
    return rows[0] ? toApproval(rows[0]) : null;
  }

  async reopen(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE staff_approvals
          SET status = 'pending', decided_by = NULL, decided_by_email = NULL, decided_at = NULL,
              decision_reason = NULL
        WHERE id = $1 AND status = 'approved'`,
      [id],
    );
  }
}
