import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type AdminFinanceQueryPort,
  type AdminInstallment,
  type AdminPayout,
  type FundMovement,
  type FundTotal,
  type InstallmentsFilter,
  type InstallmentTotal,
  type Page,
} from '../../../application/ports/admin-finance-query.port';
import { type InstallmentStatus } from '../../../domain/entities/circle-cycle';
import { type CadenceId } from '../../../domain/value-objects/cadence';

/** El cursor es la posición del último ítem: el valor de orden (texto exacto) y el id. */
function encodeCursor(sort: string, id: string): string {
  return Buffer.from(`${sort}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string | null): { sort: string; id: string } | null {
  if (!cursor) return null;
  const [sort, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!sort || !id || !isUuid(id) || Number.isNaN(Date.parse(sort))) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { sort, id };
}

function page<Row extends { sort_text: string; id: string }, T>(
  rows: Row[],
  limit: number,
  map: (row: Row) => T,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last.sort_text, last.id) : null,
  };
}

/** Fecha con microsegundos en UTC, para que el cursor reproduzca el orden exacto. */
const utcText = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

interface MemberColumns {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

const member = (row: MemberColumns) => ({
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
});

/** Lecturas de finanzas del back-office (fase 3), en SQL de solo lectura. */
@Injectable()
export class SqlAdminFinanceQuery implements AdminFinanceQueryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * La cadencia entra en el agrupamiento (COPAYNI-118): una vista por mes mezclaba una junta
   * mensual con cuatro semanas de otra en una sola cifra. Con solo juntas mensuales sale una
   * fila por estado y moneda, como antes.
   */
  async installmentTotals(period?: string, cadence?: CadenceId): Promise<InstallmentTotal[]> {
    const rows = await this.dataSource.query<
      {
        status: InstallmentStatus;
        cadence: CadenceId;
        currency: string;
        count: number;
        total: string;
      }[]
    >(
      `SELECT i.status, c.cadence, i.currency, count(*)::int AS count,
              sum(i.amount)::text AS total
         FROM circle_installments i JOIN circles c ON c.id = i.circle_id
        WHERE ($1::date IS NULL OR i.period = $1::date)
          AND ($2::text IS NULL OR c.cadence = $2)
        GROUP BY i.status, c.cadence, i.currency
        ORDER BY i.status, c.cadence, i.currency`,
      [period ? `${period}-01` : null, cadence ?? null],
    );
    return rows.map((row) => ({
      status: row.status,
      cadence: row.cadence,
      count: row.count,
      total: Money.of(Number(row.total), row.currency.trim()),
    }));
  }

  /**
   * Aporte y uso del fondo por cadencia (COPAYNI-118). Los movimientos manuales no tienen junta
   * y por tanto tampoco cadencia: salen en su propia fila, con `cadence` nulo, y no se reparten
   * entre las demás.
   */
  async fundTotals(): Promise<FundTotal[]> {
    const rows = await this.dataSource.query<
      { cadence: CadenceId | null; currency: string; contributed: string; used: string }[]
    >(
      `SELECT c.cadence, e.currency,
              coalesce(sum(e.amount) FILTER (WHERE e.amount > 0), 0)::text AS contributed,
              coalesce(-sum(e.amount) FILTER (WHERE e.amount < 0), 0)::text AS used
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.key = e.transaction_key
         LEFT JOIN circles c ON c.id = t.circle_id
        WHERE e.account = 'guarantee_fund'
        GROUP BY c.cadence, e.currency
        ORDER BY c.cadence NULLS LAST, e.currency`,
      [],
    );
    return rows.map((row) => ({
      cadence: row.cadence,
      contributed: Money.of(Number(row.contributed), row.currency.trim()),
      used: Money.of(Number(row.used), row.currency.trim()),
    }));
  }

  async installments({
    status,
    period,
    cadence,
    limit,
    cursor,
  }: InstallmentsFilter): Promise<Page<AdminInstallment>> {
    const after = decodeCursor(cursor);
    // Del vencimiento más reciente al más antiguo; dentro del mismo, por id.
    const rows = await this.dataSource.query<
      (MemberColumns & {
        id: string;
        circle_id: string;
        position: number;
        turn: number;
        cadence: CadenceId;
        period: string;
        due_on: string;
        amount: string;
        currency: string;
        status: InstallmentStatus;
        paid_at: Date | null;
        sort_text: string;
      })[]
    >(
      `SELECT i.id, i.circle_id, i.position, i.turn, c.cadence,
              to_char(i.period, 'YYYY-MM') AS period,
              to_char(i.due_on, 'YYYY-MM-DD') AS due_on, i.amount::text AS amount, i.currency,
              i.status, i.paid_at, u.id AS user_id, u.first_name, u.last_name,
              to_char(i.due_on, 'YYYY-MM-DD') AS sort_text
         FROM circle_installments i
         JOIN users u ON u.id = i.user_id
         JOIN circles c ON c.id = i.circle_id
        WHERE ($1::text IS NULL OR i.status = $1)
          AND ($2::date IS NULL OR i.period = $2::date)
          AND ($6::text IS NULL OR c.cadence = $6)
          AND ($3::date IS NULL OR (i.due_on, i.id) < ($3::date, $4::uuid))
        ORDER BY i.due_on DESC, i.id DESC
        LIMIT $5`,
      [
        status ?? null,
        period ? `${period}-01` : null,
        after?.sort ?? null,
        after?.id ?? null,
        limit + 1,
        cadence ?? null,
      ],
    );
    return page(rows, limit, (row) => ({
      id: row.id,
      circleId: row.circle_id,
      position: row.position,
      turn: row.turn,
      cadence: row.cadence,
      period: row.period,
      dueOn: row.due_on,
      amount: Money.of(Number(row.amount), row.currency.trim()),
      status: row.status,
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      member: member(row),
    }));
  }

  async payouts({
    limit,
    cursor,
  }: {
    limit: number;
    cursor: string | null;
  }): Promise<Page<AdminPayout>> {
    const after = decodeCursor(cursor);
    const rows = await this.dataSource.query<
      (MemberColumns & {
        id: string;
        circle_id: string;
        position: number;
        turn: number;
        cadence: CadenceId;
        period: string;
        amount: string;
        currency: string;
        disbursed_at: Date;
        sort_text: string;
      })[]
    >(
      `SELECT p.id, p.circle_id, p.position, p.turn, c.cadence,
              to_char(p.period, 'YYYY-MM') AS period,
              p.amount::text AS amount, p.currency, p.disbursed_at,
              u.id AS user_id, u.first_name, u.last_name,
              ${utcText('p.disbursed_at')} AS sort_text
         FROM circle_payouts p
         JOIN users u ON u.id = p.user_id
         JOIN circles c ON c.id = p.circle_id
        WHERE ($1::timestamptz IS NULL OR (p.disbursed_at, p.id) < ($1::timestamptz, $2::uuid))
        ORDER BY p.disbursed_at DESC, p.id DESC
        LIMIT $3`,
      [after?.sort ?? null, after?.id ?? null, limit + 1],
    );
    return page(rows, limit, (row) => ({
      id: row.id,
      circleId: row.circle_id,
      position: row.position,
      turn: row.turn,
      cadence: row.cadence,
      period: row.period,
      amount: Money.of(Number(row.amount), row.currency.trim()),
      disbursedAt: new Date(row.disbursed_at),
      member: member(row),
    }));
  }

  async fundMovements({
    limit,
    cursor,
  }: {
    limit: number;
    cursor: string | null;
  }): Promise<Page<FundMovement>> {
    const after = decodeCursor(cursor);
    const rows = await this.dataSource.query<
      {
        id: string;
        transaction_key: string;
        kind: string;
        circle_id: string | null;
        cadence: CadenceId | null;
        period: string | null;
        reason: string | null;
        amount: string;
        currency: string;
        created_at: Date;
        sort_text: string;
      }[]
    >(
      `SELECT e.id, t.key AS transaction_key, t.kind, t.circle_id, c.cadence,
              to_char(t.period, 'YYYY-MM') AS period, t.reason, e.amount::text AS amount,
              e.currency, t.created_at, ${utcText('t.created_at')} AS sort_text
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.key = e.transaction_key
         LEFT JOIN circles c ON c.id = t.circle_id
        WHERE e.account = 'guarantee_fund'
          AND ($1::timestamptz IS NULL OR (t.created_at, e.id) < ($1::timestamptz, $2::uuid))
        ORDER BY t.created_at DESC, e.id DESC
        LIMIT $3`,
      [after?.sort ?? null, after?.id ?? null, limit + 1],
    );
    return page(rows, limit, (row) => ({
      transactionKey: row.transaction_key,
      kind: row.kind,
      circleId: row.circle_id,
      cadence: row.cadence,
      period: row.period,
      reason: row.reason,
      amount: Money.of(Number(row.amount), row.currency.trim()),
      createdAt: new Date(row.created_at),
    }));
  }
}
