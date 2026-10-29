import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { LocalDate } from '../../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type DueInstallment,
  type PaymentsQueryPort,
} from '../../../application/ports/payments-query.port';
import { CircleEntity } from './circle.entity';

/** PaymentsQueryPort sobre PostgreSQL: lee las cuotas y payouts que guarda el ciclo. */
@Injectable()
export class TypeOrmPaymentsQuery implements PaymentsQueryPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async dueInstallmentsOf(userId: string): Promise<DueInstallment[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.circles.query<
      {
        circle_id: string;
        period: string;
        due_on: string;
        amount: string;
        currency: string;
        status: DueInstallment['status'];
      }[]
    >(
      `SELECT i.circle_id, to_char(i.period, 'YYYY-MM') AS period,
              to_char(i.due_on, 'YYYY-MM-DD') AS due_on, i.amount::text AS amount, i.currency,
              i.status
         FROM circle_installments i
         JOIN circle_memberships m ON m.circle_id = i.circle_id AND m.user_id = i.user_id
        WHERE i.user_id = $1 AND i.status IN ('pending', 'overdue') AND m.expelled_at IS NULL
        ORDER BY i.due_on, i.circle_id`,
      [userId],
    );
    return rows.map((row) => ({
      circleId: row.circle_id,
      period: Period.parse(row.period),
      dueOn: LocalDate.parse(row.due_on),
      amount: Money.of(Number(row.amount), row.currency),
      status: row.status,
    }));
  }
}
