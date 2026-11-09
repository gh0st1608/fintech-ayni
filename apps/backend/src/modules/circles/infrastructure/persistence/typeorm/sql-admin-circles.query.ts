import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type AdminCircleDetail,
  type AdminCirclesFilter,
  type AdminCirclesPage,
  type AdminCirclesQueryPort,
  type AdminCircleSummary,
} from '../../../application/ports/admin-circles-query.port';
import { type CycleState } from '../../../domain/entities/circle-cycle';

interface SummaryRow {
  id: string;
  cycle_state: CycleState;
  payout_amount: string;
  currency: string;
  months: number;
  starts_on: string;
  members: number;
  created_at: Date;
}

interface DetailRow extends SummaryRow {
  current_period: string | null;
  paused_on: string | null;
}

interface MemberRow {
  user_id: string;
  position: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: Date;
  expelled_at: Date | null;
}

interface ProposalRow {
  round: number;
  payout_amount: string;
  months: number;
  respond_by: string;
  accepted: number;
  withdrawn: number;
}

const SUMMARY_COLUMNS = `
  c.id, c.cycle_state, c.payout_amount::text AS payout_amount, c.currency, c.months,
  to_char(c.starts_on, 'YYYY-MM') AS starts_on, c.created_at,
  (SELECT count(*)::int FROM circle_memberships m
    WHERE m.circle_id = c.id AND m.expelled_at IS NULL) AS members`;

/** El cursor es la posición del último ítem: `created_at` (con microsegundos) e `id`. */
function encodeCursor(row: { id: string; created_at_text: string }): string {
  return Buffer.from(`${row.created_at_text}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id || !isUuid(id) || Number.isNaN(Date.parse(createdAt))) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { createdAt, id };
}

const toSummary = (row: SummaryRow): AdminCircleSummary => ({
  circleId: row.id,
  state: row.cycle_state,
  payout: Money.of(Number(row.payout_amount), row.currency.trim()),
  months: row.months,
  startsOn: row.starts_on,
  members: row.members,
  createdAt: row.created_at,
});

/** Lecturas del back-office sobre los círculos, en SQL de solo lectura. */
@Injectable()
export class SqlAdminCirclesQuery implements AdminCirclesQueryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list({ state, limit, cursor }: AdminCirclesFilter): Promise<AdminCirclesPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.dataSource.query<(SummaryRow & { created_at_text: string })[]>(
      `SELECT ${SUMMARY_COLUMNS},
              to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS created_at_text
         FROM circles c
        WHERE ($1::text IS NULL OR c.cycle_state = $1)
          AND ($2::timestamptz IS NULL OR (c.created_at, c.id) < ($2::timestamptz, $3::uuid))
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $4`,
      [state ?? null, after?.createdAt ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
    };
  }

  async find(circleId: string): Promise<AdminCircleDetail | null> {
    if (!isUuid(circleId)) return null;
    const [circle] = await this.dataSource.query<DetailRow[]>(
      `SELECT ${SUMMARY_COLUMNS},
              to_char(c.current_period, 'YYYY-MM') AS current_period,
              to_char(c.paused_on, 'YYYY-MM-DD') AS paused_on
         FROM circles c WHERE c.id = $1`,
      [circleId],
    );
    if (!circle) return null;
    const members = await this.dataSource.query<MemberRow[]>(
      `SELECT m.user_id, m.position, u.email, u.phone, u.first_name, u.last_name, m.created_at,
              m.expelled_at
         FROM circle_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.circle_id = $1
        ORDER BY m.expelled_at IS NOT NULL, m.position`,
      [circleId],
    );
    const [proposal] = await this.dataSource.query<ProposalRow[]>(
      `SELECT p.round, p.payout_amount::text AS payout_amount, p.months,
              to_char(p.respond_by, 'YYYY-MM-DD') AS respond_by,
              count(r.*) FILTER (WHERE r.decision = 'accepted')::int AS accepted,
              count(r.*) FILTER (WHERE r.decision = 'withdrawn')::int AS withdrawn
         FROM circle_start_proposals p
         LEFT JOIN circle_start_responses r ON r.circle_id = p.circle_id
        WHERE p.circle_id = $1
        GROUP BY p.circle_id`,
      [circleId],
    );
    const currency = circle.currency.trim();
    return {
      ...toSummary(circle),
      currentPeriod: circle.current_period,
      pausedOn: circle.paused_on,
      memberships: members.map((member) => ({
        userId: member.user_id,
        position: member.position,
        email: member.email,
        phone: member.phone,
        firstName: member.first_name,
        lastName: member.last_name,
        joinedAt: member.created_at,
        expelledAt: member.expelled_at,
      })),
      startProposal: proposal
        ? {
            round: proposal.round,
            payout: Money.of(Number(proposal.payout_amount), currency),
            months: proposal.months,
            respondBy: proposal.respond_by,
            accepted: proposal.accepted,
            withdrawn: proposal.withdrawn,
          }
        : null,
    };
  }
}
