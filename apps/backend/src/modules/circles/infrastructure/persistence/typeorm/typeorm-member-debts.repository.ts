import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type MemberDebt,
  type MemberDebtsPort,
} from '../../../application/ports/member-debts.port';
import { CircleEntity } from './circle.entity';

/** MemberDebtsPort sobre `circle_expulsions` (COPAYNI-57). */
@Injectable()
export class TypeOrmMemberDebts implements MemberDebtsPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async openDebtsOf(userId: string): Promise<MemberDebt[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.circles.query<
      { circle_id: string; overdue_amount: string; late_fee_amount: string; currency: string }[]
    >(
      `SELECT circle_id, overdue_amount::text AS overdue_amount,
              late_fee_amount::text AS late_fee_amount, currency
         FROM circle_expulsions
        WHERE user_id = $1 AND settled_at IS NULL
        ORDER BY created_at, id`,
      [userId],
    );
    return rows.map((row) => ({
      circleId: row.circle_id,
      overdue: Money.of(Number(row.overdue_amount), row.currency),
      lateFee: Money.of(Number(row.late_fee_amount), row.currency),
    }));
  }

  async settle(userId: string, circleId: string): Promise<boolean> {
    if (!isUuid(userId) || !isUuid(circleId)) return false;
    const [, affected] = await this.circles.query<[unknown, number]>(
      `UPDATE circle_expulsions SET settled_at = now()
        WHERE user_id = $1 AND circle_id = $2 AND settled_at IS NULL`,
      [userId, circleId],
    );
    return affected > 0;
  }
}
