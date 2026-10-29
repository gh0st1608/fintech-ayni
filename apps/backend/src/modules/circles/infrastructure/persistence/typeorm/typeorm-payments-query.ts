import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { LocalDate } from '../../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import { InvalidCursorError } from '../../../application/ports/circle-repository.port';
import {
  type DueInstallment,
  type PaymentsQueryPort,
  type TransactionKind,
  type TransactionPage,
  type TransactionType,
} from '../../../application/ports/payments-query.port';

interface TransactionRow {
  id: string;
  kind: TransactionKind;
  circle_id: string;
  period: string | null;
  amount: string;
  currency: string;
  /** `occurred_at::text`: conserva los microsegundos para el cursor. */
  occurred_at: string;
}

/** Pagos: cuotas cobradas y deudas saldadas. Cobros: payouts y devoluciones pagadas. */
const SOURCES: Record<TransactionType, string> = {
  payment: `
    SELECT i.id, 'installment' AS kind, i.circle_id, to_char(i.period, 'YYYY-MM') AS period,
           i.amount AS amount, i.currency, i.paid_at AS occurred_at
      FROM circle_installments i
     WHERE i.user_id = $1 AND i.status = 'paid' AND i.paid_at IS NOT NULL
    UNION ALL
    SELECT e.id, 'debt_settlement', e.circle_id, to_char(e.period, 'YYYY-MM'),
           e.overdue_amount + e.late_fee_amount, e.currency, e.settled_at
      FROM circle_expulsions e
     WHERE e.user_id = $1 AND e.settled_at IS NOT NULL`,
  payout: `
    SELECT p.id, 'payout' AS kind, p.circle_id, to_char(p.period, 'YYYY-MM') AS period,
           p.amount AS amount, p.currency, p.disbursed_at AS occurred_at
      FROM circle_payouts p
     WHERE p.user_id = $1
    UNION ALL
    SELECT e.id, 'refund', e.circle_id, NULL, e.refund_amount, e.currency, e.refunded_at
      FROM circle_expulsions e
     WHERE e.user_id = $1 AND e.refunded_at IS NOT NULL AND e.refund_amount > 0`,
};

const TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

/** Cursor opaco: la posición (fecha, id) del último movimiento de la página. */
const encodeCursor = (occurredAt: string, id: string): string =>
  Buffer.from(JSON.stringify([occurredAt, id])).toString('base64url');

function decodeCursor(cursor: string): [string, string] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [occurredAt, id] = parsed as unknown[];
      if (
        typeof occurredAt === 'string' &&
        TIMESTAMPTZ.test(occurredAt) &&
        typeof id === 'string' &&
        isUuid(id)
      ) {
        return [occurredAt, id];
      }
    }
  } catch {
    // Cae al error de abajo: un cursor que no es JSON no lo generó este repositorio.
  }
  throw new InvalidCursorError();
}
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

  async transactionsOf(query: {
    userId: string;
    type: TransactionType;
    limit: number;
    cursor: string | null;
  }): Promise<TransactionPage> {
    const { userId, type, limit } = query;
    const after = query.cursor === null ? null : decodeCursor(query.cursor);
    if (!isUuid(userId)) return { items: [], nextCursor: null };

    const params: unknown[] = [userId, limit + 1];
    let keyset = '';
    if (after) {
      params.push(...after);
      keyset = 'WHERE (t.occurred_at, t.id) < ($3::timestamptz, $4::uuid)';
    }
    const rows = await this.circles.query<TransactionRow[]>(
      `SELECT t.id, t.kind, t.circle_id, t.period, t.amount::text AS amount, t.currency,
              t.occurred_at::text AS occurred_at
         FROM (${SOURCES[type]}) t
         ${keyset}
        ORDER BY t.occurred_at DESC, t.id DESC
        LIMIT $2`,
      params,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        id: row.id,
        type,
        kind: row.kind,
        circleId: row.circle_id,
        period: row.period ? Period.parse(row.period) : null,
        amount: Money.of(Number(row.amount), row.currency),
        occurredAt: new Date(row.occurred_at),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.occurred_at, last.id) : null,
    };
  }
}
