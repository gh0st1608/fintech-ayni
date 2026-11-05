import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { LocalDate } from '../../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
import { NotFoundError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type CircleStartProposalsPort,
  type MemberStartProposal,
} from '../../../application/ports/start-proposals.port';
import { newPositions, type StartDecision } from '../../../domain/services/start-approval';
import { CircleTerms } from '../../../domain/value-objects/circle-terms';

interface ProposalRow {
  circle_id: string;
  payout_amount: string;
  proposed_payout: string;
  currency: string;
  months: number;
  proposed_months: number;
  starts_on: string;
  respond_by: string;
  decision: StartDecision | null;
}

/** CircleStartProposalsPort sobre PostgreSQL, con el advisory lock del ciclo mensual. */
@Injectable()
export class SqlStartProposalsRepository implements CircleStartProposalsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listFor(userId: string): Promise<MemberStartProposal[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.dataSource.query<ProposalRow[]>(
      `SELECT c.id AS circle_id, c.payout_amount::text AS payout_amount, c.currency, c.months,
              p.payout_amount::text AS proposed_payout, p.months AS proposed_months,
              to_char(c.starts_on, 'YYYY-MM') AS starts_on,
              to_char(p.respond_by, 'YYYY-MM-DD') AS respond_by, r.decision
         FROM circle_memberships m
         JOIN circles c ON c.id = m.circle_id AND c.cycle_state = 'approving'
         JOIN circle_start_proposals p ON p.circle_id = c.id
         LEFT JOIN circle_start_responses r ON r.circle_id = c.id AND r.user_id = m.user_id
        WHERE m.user_id = $1 AND m.expelled_at IS NULL
        ORDER BY p.respond_by, c.id`,
      [userId],
    );
    return Promise.all(rows.map((row) => this.toProposal(row, userId)));
  }

  private async toProposal(row: ProposalRow, userId: string): Promise<MemberStartProposal> {
    const members = await this.dataSource.query<{ user_id: string; position: number }[]>(
      'SELECT user_id, position FROM circle_memberships WHERE circle_id = $1 AND expelled_at IS NULL',
      [row.circle_id],
    );
    const positions = newPositions(
      members.map((member) => ({ userId: member.user_id, position: member.position })),
    );
    const startsOn = Period.parse(row.starts_on);
    return {
      circleId: row.circle_id,
      current: CircleTerms.create({
        payout: Money.of(Number(row.payout_amount), row.currency),
        months: row.months,
        startsOn,
      }),
      proposed: CircleTerms.create({
        payout: Money.of(Number(row.proposed_payout), row.currency),
        months: row.proposed_months,
        startsOn,
      }),
      position: positions.get(userId)!,
      respondBy: LocalDate.parse(row.respond_by),
      decision: row.decision,
    };
  }

  respond(circleId: string, userId: string, decision: StartDecision): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [circleId]);
      const [open] = await manager.query<{ id: string }[]>(
        `SELECT c.id FROM circles c
           JOIN circle_memberships m ON m.circle_id = c.id
          WHERE c.id = $1 AND c.cycle_state = 'approving' AND m.user_id = $2`,
        [circleId, userId],
      );
      if (!open) {
        throw new NotFoundError(
          'No tienes una propuesta para ese círculo',
          'START_PROPOSAL_NOT_FOUND',
        );
      }
      await manager.query(
        `INSERT INTO circle_start_responses (circle_id, user_id, decision) VALUES ($1, $2, $3)
         ON CONFLICT (circle_id, user_id)
         DO UPDATE SET decision = EXCLUDED.decision, responded_at = now()`,
        [circleId, userId, decision],
      );
    });
  }
}
