import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { maskName } from '../../../../../shared/domain/services/mask-pii';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type DelinquencyPage,
  type DelinquencyQueryPort,
  type DelinquencyView,
} from '../../../application/use-cases/admin-delinquency.use-cases';

interface Row {
  id: string;
  circle_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  period: string;
  date: string;
  amount: string;
  late_fee: string | null;
  currency: string;
  settled_at: Date | null;
  grace_ends_on: string | null;
  sort_text: string;
}

/**
 * Cada vista es un SELECT con las mismas columnas. `$1` es hoy y `$2` los días de gracia; las vistas
 * que no los usan los nombran igual (`IS NOT NULL`) para que PostgreSQL conozca su tipo. El orden
 * es de lo más reciente a lo más antiguo (`sort_text` exacto, como texto, para el cursor).
 */
const VIEWS: Record<DelinquencyView, { from: string; pending: string }> = {
  // Cuotas vencidas sin pagar que siguen dentro de la gracia (el miembro no fue expulsado).
  grace: {
    from: `
      SELECT i.id, i.circle_id, i.user_id, u.first_name, u.last_name,
             to_char(i.period, 'YYYY-MM') AS period, to_char(i.due_on, 'YYYY-MM-DD') AS date,
             i.amount::text AS amount, NULL::text AS late_fee, i.currency, NULL::timestamptz AS settled_at,
             to_char(i.due_on + $2::int, 'YYYY-MM-DD') AS grace_ends_on,
             to_char(i.due_on, 'YYYY-MM-DD') AS sort_text
        FROM circle_installments i
        JOIN users u ON u.id = i.user_id
        JOIN circle_memberships m ON m.circle_id = i.circle_id AND m.user_id = i.user_id
       WHERE i.status = 'overdue' AND m.expelled_at IS NULL AND i.due_on + $2::int >= $1::date`,
    pending: 'amount',
  },
  expelled: {
    from: `
      SELECT e.id, e.circle_id, e.user_id, u.first_name, u.last_name,
             to_char(e.period, 'YYYY-MM') AS period, to_char(e.expelled_on, 'YYYY-MM-DD') AS date,
             e.overdue_amount::text AS amount, e.late_fee_amount::text AS late_fee, e.currency,
             e.settled_at, NULL::text AS grace_ends_on,
             to_char(e.expelled_on, 'YYYY-MM-DD') AS sort_text
        FROM circle_expulsions e JOIN users u ON u.id = e.user_id
       WHERE $1::date IS NOT NULL AND $2::int IS NOT NULL`,
    pending: 'amount + late_fee',
  },
  // Lo vencido más el cargo por mora de los expulsados, saldado o no.
  debts: {
    from: `
      SELECT e.id, e.circle_id, e.user_id, u.first_name, u.last_name,
             to_char(e.period, 'YYYY-MM') AS period, to_char(e.expelled_on, 'YYYY-MM-DD') AS date,
             e.overdue_amount::text AS amount, e.late_fee_amount::text AS late_fee, e.currency,
             e.settled_at, NULL::text AS grace_ends_on,
             to_char(e.expelled_on, 'YYYY-MM-DD') AS sort_text
        FROM circle_expulsions e JOIN users u ON u.id = e.user_id
       WHERE e.overdue_amount + e.late_fee_amount > 0 AND $1::date IS NOT NULL
         AND $2::int IS NOT NULL`,
    pending: 'amount + late_fee',
  },
  // Cuotas a devolver a quien fue expulsado antes de su turno.
  refunds: {
    from: `
      SELECT e.id, e.circle_id, e.user_id, u.first_name, u.last_name,
             to_char(e.period, 'YYYY-MM') AS period, to_char(e.expelled_on, 'YYYY-MM-DD') AS date,
             e.refund_amount::text AS amount, NULL::text AS late_fee, e.currency,
             e.refunded_at AS settled_at, NULL::text AS grace_ends_on,
             to_char(e.expelled_on, 'YYYY-MM-DD') AS sort_text
        FROM circle_expulsions e JOIN users u ON u.id = e.user_id
       WHERE e.refund_amount > 0 AND $1::date IS NOT NULL AND $2::int IS NOT NULL`,
    pending: 'amount',
  },
};

const encodeCursor = (row: Row): string =>
  Buffer.from(`${row.sort_text}|${row.id}`).toString('base64url');

function decodeCursor(cursor: string): { sort: string; id: string } {
  const [sort, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!sort || !id || !isUuid(id) || !/^\d{4}-\d{2}-\d{2}$/.test(sort)) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { sort, id };
}

@Injectable()
export class SqlDelinquencyQuery implements DelinquencyQueryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(filter: {
    view: DelinquencyView;
    today: string;
    graceDays: number;
    limit: number;
    cursor: string | null;
  }): Promise<DelinquencyPage> {
    const view = VIEWS[filter.view];
    const params: unknown[] = [filter.today, filter.graceDays];
    let after = '';
    if (filter.cursor) {
      const { sort, id } = decodeCursor(filter.cursor);
      params.push(sort, id);
      after = 'WHERE (v.sort_text, v.id) < ($3, $4::uuid)';
    }
    params.push(filter.limit + 1);
    const rows = await this.dataSource.query<Row[]>(
      `SELECT v.* FROM (${view.from}) v ${after}
        ORDER BY v.sort_text DESC, v.id DESC LIMIT $${params.length}`,
      params,
    );
    const totals = await this.dataSource.query<{ currency: string; pending: string }[]>(
      `SELECT v.currency, sum(${view.pending
        .split(' + ')
        .map((column) => `coalesce(v.${column}::bigint, 0)`)
        .join(' + ')})::text AS pending
         FROM (${view.from}) v WHERE v.settled_at IS NULL
        GROUP BY v.currency ORDER BY v.currency`,
      [filter.today, filter.graceDays],
    );
    const items = rows.slice(0, filter.limit);
    return {
      items: items.map((row) => {
        const currency = row.currency.trim();
        return {
          id: row.id,
          circleId: row.circle_id,
          member: { userId: row.user_id, name: maskName(row.first_name, row.last_name) },
          period: row.period,
          date: row.date,
          amount: Money.of(Number(row.amount ?? 0), currency),
          lateFee: row.late_fee === null ? null : Money.of(Number(row.late_fee), currency),
          settledAt: row.settled_at ? new Date(row.settled_at) : null,
          graceEndsOn: row.grace_ends_on,
        };
      }),
      nextCursor: rows.length > filter.limit ? encodeCursor(items.at(-1)!) : null,
      pending: totals.map(({ currency, pending }) => Money.of(Number(pending), currency.trim())),
    };
  }
}
