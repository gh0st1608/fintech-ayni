import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, type Repository } from 'typeorm';

import { LocalDate } from '../../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
import { NotFoundError } from '../../../../../shared/errors/app-error';
import {
  type CircleCycleRepositoryPort,
  type StoredCycle,
} from '../../../application/ports/circle-cycle-repository.port';
import {
  type CircleCycle,
  type CycleState,
  type InstallmentStatus,
} from '../../../domain/entities/circle-cycle';
import { CircleTerms } from '../../../domain/value-objects/circle-terms';
import { CircleEntity } from './circle.entity';
import { fundBalance, insertLedgerTransaction, lockFund } from './ledger.sql';
import { fromStoredPrice, type StoredSlotPrice } from './slot-price.mapper';

const toDate = (period: Period): string => `${period.toString()}-01`;

interface CircleRow {
  payout_amount: string;
  currency: string;
  months: number;
  starts_on: string;
  cycle_state: CycleState;
  current_period: string | null;
  paused_on: string | null;
}

interface InstallmentRow {
  id: string;
  user_id: string;
  position: number;
  period: string;
  due_on: string;
  amount: string;
  currency: string;
  status: InstallmentStatus;
}

/**
 * CircleCycleRepositoryPort sobre PostgreSQL. El bloqueo es un advisory lock de transacción por
 * círculo: una segunda ejecución no espera, sigue con otro círculo. Con el círculo bloqueado
 * espera el bloqueo del fondo de garantía (COPAYNI-58), que es uno solo para todos.
 */
@Injectable()
export class TypeOrmCircleCycleRepository implements CircleCycleRepositoryPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async listToAdvance(today: Period): Promise<string[]> {
    const rows = await this.circles.query<{ id: string }[]>(
      `SELECT id FROM circles
        WHERE cycle_state = 'contributing' OR (cycle_state = 'collecting' AND starts_on <= $1::date)
        ORDER BY starts_on, id`,
      [toDate(today)],
    );
    return rows.map(({ id }) => id);
  }

  withLock(
    circleId: string,
    work: (stored: StoredCycle) => Promise<CircleCycle>,
    options: { wait?: boolean } = {},
  ): Promise<boolean> {
    return this.circles.manager.transaction(async (manager) => {
      if (options.wait) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [circleId]);
      } else {
        const [lock] = await manager.query<{ locked: boolean }[]>(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
          [circleId],
        );
        if (!lock?.locked) return false;
      }
      await lockFund(manager);
      await this.save(manager, await work(await this.load(manager, circleId)));
      return true;
    });
  }

  private async load(manager: EntityManager, circleId: string): Promise<StoredCycle> {
    const [circle] = await manager.query<CircleRow[]>(
      `SELECT payout_amount::text AS payout_amount, currency, months, cycle_state,
              to_char(starts_on, 'YYYY-MM') AS starts_on,
              to_char(current_period, 'YYYY-MM') AS current_period,
              to_char(paused_on, 'YYYY-MM-DD') AS paused_on
         FROM circles WHERE id = $1`,
      [circleId],
    );
    if (!circle) throw new NotFoundError(`No existe el círculo ${circleId}`, 'CIRCLE_NOT_FOUND');
    const members = await manager.query<
      { user_id: string; position: number; price: StoredSlotPrice | null }[]
    >(
      'SELECT user_id, position, price FROM circle_memberships WHERE circle_id = $1 AND expelled_at IS NULL',
      [circleId],
    );
    const installments = circle.current_period
      ? await manager.query<InstallmentRow[]>(
          `SELECT id, user_id, position, to_char(period, 'YYYY-MM') AS period,
                  to_char(due_on, 'YYYY-MM-DD') AS due_on, amount::text AS amount, currency, status
             FROM circle_installments WHERE circle_id = $1 AND period = $2::date`,
          [circleId, `${circle.current_period}-01`],
        )
      : [];

    const pendingRefunds = await manager.query<
      { user_id: string; paid_amount: string; refund_amount: string; currency: string }[]
    >(
      `SELECT user_id, paid_amount::text AS paid_amount, refund_amount::text AS refund_amount,
              currency
         FROM circle_expulsions
        WHERE circle_id = $1 AND refunded_at IS NULL
              AND paid_amount IS NOT NULL AND refund_amount IS NOT NULL`,
      [circleId],
    );

    return {
      circleId,
      fundBalance: await fundBalance(manager, circle.currency),
      pendingRefunds: pendingRefunds.map((row) => ({
        userId: row.user_id,
        paid: Money.of(Number(row.paid_amount), row.currency),
        refund: Money.of(Number(row.refund_amount), row.currency),
      })),
      terms: CircleTerms.create({
        payout: Money.of(Number(circle.payout_amount), circle.currency),
        months: circle.months,
        startsOn: Period.parse(circle.starts_on),
      }),
      state: circle.cycle_state,
      currentPeriod: circle.current_period ? Period.parse(circle.current_period) : null,
      pausedOn: circle.paused_on ? LocalDate.parse(circle.paused_on) : null,
      members: members.map(({ user_id, position, price }) => ({
        userId: user_id,
        position,
        ...(price && { price: fromStoredPrice(price) }),
      })),
      installments: installments.map((row) => ({
        id: row.id,
        userId: row.user_id,
        position: row.position,
        period: Period.parse(row.period),
        dueOn: LocalDate.parse(row.due_on),
        amount: Money.of(Number(row.amount), row.currency),
        status: row.status,
      })),
    };
  }

  private async save(manager: EntityManager, cycle: CircleCycle): Promise<void> {
    await manager.query(
      `UPDATE circles SET cycle_state = $2, current_period = $3, paused_on = $4, starts_on = $5
        WHERE id = $1`,
      [
        cycle.circleId,
        cycle.state,
        cycle.currentPeriod ? toDate(cycle.currentPeriod) : null,
        cycle.pausedOn?.toString() ?? null,
        toDate(cycle.terms.startsOn),
      ],
    );
    if (cycle.calendarShift > 0 && cycle.currentPeriod) {
      // Al reanudar en otro mes, las cuotas del mes en curso pasan al mes nuevo (COPAYNI-61).
      await manager.query(
        `UPDATE circle_installments SET period = $3::date
          WHERE circle_id = $1 AND period = $2::date`,
        [
          cycle.circleId,
          toDate(cycle.currentPeriod.addMonths(-cycle.calendarShift)),
          toDate(cycle.currentPeriod),
        ],
      );
    }
    for (const event of cycle.adminEvents) {
      await manager.query(
        `INSERT INTO circle_admin_events (circle_id, action, actor_id, reason, before, after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          cycle.circleId,
          event.action,
          event.actorId,
          event.reason,
          JSON.stringify(event.before),
          JSON.stringify(event.after),
        ],
      );
    }
    for (const installment of cycle.installments) {
      await manager.query(
        `INSERT INTO circle_installments
           (id, circle_id, user_id, position, period, due_on, amount, currency, status, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, CASE WHEN $9::varchar = 'paid' THEN now() END)
         ON CONFLICT ON CONSTRAINT uq_circle_installments_period DO UPDATE
           SET status = EXCLUDED.status,
               due_on = EXCLUDED.due_on,
               paid_at = COALESCE(circle_installments.paid_at, EXCLUDED.paid_at)`,
        [
          installment.id,
          cycle.circleId,
          installment.userId,
          installment.position,
          toDate(installment.period),
          installment.dueOn.toString(),
          installment.amount.amount,
          installment.amount.currency,
          installment.status,
        ],
      );
    }
    for (const payout of cycle.disbursements) {
      await manager.query(
        `INSERT INTO circle_payouts (circle_id, period, user_id, position, amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_circle_payouts_period DO NOTHING`,
        [
          cycle.circleId,
          toDate(payout.period),
          payout.userId,
          payout.position,
          payout.amount.amount,
          payout.amount.currency,
        ],
      );
    }
    for (const expulsion of cycle.expulsions) {
      await manager.query(
        `INSERT INTO circle_expulsions
           (circle_id, user_id, position, period, expelled_on, overdue_amount, late_fee_amount,
            paid_amount, refund_amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT ON CONSTRAINT uq_circle_expulsions_member DO NOTHING`,
        [
          cycle.circleId,
          expulsion.userId,
          expulsion.position,
          toDate(expulsion.period),
          expulsion.expelledOn.toString(),
          expulsion.overdue.amount,
          expulsion.lateFee.amount,
          expulsion.paid?.amount ?? null,
          expulsion.refund?.amount ?? null,
          expulsion.overdue.currency,
        ],
      );
      await manager.query(
        `UPDATE circle_memberships SET expelled_at = now()
          WHERE circle_id = $1 AND user_id = $2 AND expelled_at IS NULL`,
        [cycle.circleId, expulsion.userId],
      );
    }
    for (const transaction of cycle.ledger) {
      await insertLedgerTransaction(manager, transaction);
    }
    if (cycle.isFinished()) {
      // Las devoluciones se decidieron y pagaron al terminar (CircleCycle.refunds).
      await manager.query(
        `UPDATE circle_expulsions SET refunded_at = now()
          WHERE circle_id = $1 AND refund_amount IS NOT NULL AND refunded_at IS NULL`,
        [cycle.circleId],
      );
    }
  }
}
