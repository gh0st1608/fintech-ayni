import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, type Repository } from 'typeorm';

import { LocalDate } from '../../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
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
import { fromStoredPrice, type StoredSlotPrice } from './slot-price.mapper';

const toDate = (period: Period): string => `${period.toString()}-01`;

interface CircleRow {
  payout_amount: string;
  currency: string;
  months: number;
  starts_on: string;
  cycle_state: CycleState;
  current_period: string | null;
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
 * círculo: una segunda ejecución no espera, sigue con otro círculo.
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
  ): Promise<boolean> {
    return this.circles.manager.transaction(async (manager) => {
      const [lock] = await manager.query<{ locked: boolean }[]>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
        [circleId],
      );
      if (!lock?.locked) return false;
      await this.save(manager, await work(await this.load(manager, circleId)));
      return true;
    });
  }

  private async load(manager: EntityManager, circleId: string): Promise<StoredCycle> {
    const [circle] = await manager.query<CircleRow[]>(
      `SELECT payout_amount::text AS payout_amount, currency, months, cycle_state,
              to_char(starts_on, 'YYYY-MM') AS starts_on,
              to_char(current_period, 'YYYY-MM') AS current_period
         FROM circles WHERE id = $1`,
      [circleId],
    );
    if (!circle) throw new Error(`No existe el círculo ${circleId}`);
    const members = await manager.query<
      { user_id: string; position: number; price: StoredSlotPrice | null }[]
    >('SELECT user_id, position, price FROM circle_memberships WHERE circle_id = $1', [circleId]);
    const installments = circle.current_period
      ? await manager.query<InstallmentRow[]>(
          `SELECT id, user_id, position, to_char(period, 'YYYY-MM') AS period,
                  to_char(due_on, 'YYYY-MM-DD') AS due_on, amount::text AS amount, currency, status
             FROM circle_installments WHERE circle_id = $1 AND period = $2::date`,
          [circleId, `${circle.current_period}-01`],
        )
      : [];

    return {
      circleId,
      terms: CircleTerms.create({
        payout: Money.of(Number(circle.payout_amount), circle.currency),
        months: circle.months,
        startsOn: Period.parse(circle.starts_on),
      }),
      state: circle.cycle_state,
      currentPeriod: circle.current_period ? Period.parse(circle.current_period) : null,
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
    await manager.query('UPDATE circles SET cycle_state = $2, current_period = $3 WHERE id = $1', [
      cycle.circleId,
      cycle.state,
      cycle.currentPeriod ? toDate(cycle.currentPeriod) : null,
    ]);
    for (const installment of cycle.installments) {
      await manager.query(
        `INSERT INTO circle_installments
           (id, circle_id, user_id, position, period, due_on, amount, currency, status, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, CASE WHEN $9::varchar = 'paid' THEN now() END)
         ON CONFLICT ON CONSTRAINT uq_circle_installments_period DO UPDATE
           SET status = EXCLUDED.status,
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
  }
}
