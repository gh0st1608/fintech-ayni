import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type MemberDebt,
  type MemberDebtsPort,
} from '../../../application/ports/member-debts.port';
import { type LedgerTransaction } from '../../../domain/value-objects/ledger-transaction';
import { CircleEntity } from './circle.entity';
import { insertLedgerTransaction } from './ledger.sql';

interface DebtRow {
  circle_id: string;
  overdue_amount: string;
  late_fee_amount: string;
  currency: string;
}

/** MemberDebtsPort sobre `circle_expulsions` (COPAYNI-57) y el registro contable (COPAYNI-58). */
@Injectable()
export class TypeOrmMemberDebts implements MemberDebtsPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async openDebtsOf(userId: string): Promise<MemberDebt[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.circles.query<DebtRow[]>(
      `SELECT circle_id, overdue_amount::text AS overdue_amount,
              late_fee_amount::text AS late_fee_amount, currency
         FROM circle_expulsions
        WHERE user_id = $1 AND settled_at IS NULL
        ORDER BY created_at, id`,
      [userId],
    );
    return rows.map((row) => TypeOrmMemberDebts.toDebt(row));
  }

  async settle(
    userId: string,
    circleId: string,
    recovery: (debt: MemberDebt) => LedgerTransaction,
  ): Promise<MemberDebt | null> {
    if (!isUuid(userId) || !isUuid(circleId)) return null;
    return this.circles.manager.transaction(async (manager) => {
      const [rows] = await manager.query<[DebtRow[], number]>(
        `UPDATE circle_expulsions SET settled_at = now()
          WHERE user_id = $1 AND circle_id = $2 AND settled_at IS NULL
          RETURNING circle_id, overdue_amount::text AS overdue_amount,
                    late_fee_amount::text AS late_fee_amount, currency`,
        [userId, circleId],
      );
      const [row] = rows;
      if (!row) return null;
      const debt = TypeOrmMemberDebts.toDebt(row);
      await insertLedgerTransaction(manager, recovery(debt));
      return debt;
    });
  }

  private static toDebt(row: DebtRow): MemberDebt {
    return {
      circleId: row.circle_id,
      overdue: Money.of(Number(row.overdue_amount), row.currency),
      lateFee: Money.of(Number(row.late_fee_amount), row.currency),
    };
  }
}
