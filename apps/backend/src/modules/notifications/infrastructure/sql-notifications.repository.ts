import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ValidationError } from '../../../shared/errors/app-error';
import { isUuid } from '../../../shared/infrastructure/persistence/postgres-errors';
import {
  type NotificationsFilter,
  type NotificationsPort,
} from '../application/notifications.ports';
import {
  type Notification,
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from '../domain/notification';

/**
 * Cada fuente es un `SELECT` de (user_id, type, category, data, dedupe_key, occurred_at) sobre los
 * hechos ya guardados. `$1` limita a una persona (o `NULL` para todas), `$2` es hoy (`YYYY-MM-DD`
 * en la zona del negocio) y `$3` los días de aviso previo al vencimiento.
 */
const ME = (column: string): string => `($1::uuid IS NULL OR ${column} = $1::uuid)`;
const MONEY = (amount: string, currency: string): string =>
  `jsonb_build_object('amount', ${amount}, 'currency', ${currency})`;

const SOURCES: readonly string[] = [
  // Cuota por vencer: N días antes y el mismo día, solo si sigue pendiente.
  `SELECT i.user_id, 'installment_due_soon', 'payments',
          jsonb_build_object('circleId', i.circle_id, 'amount', ${MONEY('i.amount', 'i.currency')},
                             'dueOn', to_char(i.due_on, 'YYYY-MM-DD')),
          'due_soon:' || i.id, ($2::date)::timestamp AT TIME ZONE 'UTC'
     FROM circle_installments i
    WHERE i.status = 'pending' AND i.due_on > $2::date AND i.due_on <= $2::date + $3::int
      AND ${ME('i.user_id')}`,
  `SELECT i.user_id, 'installment_due_today', 'payments',
          jsonb_build_object('circleId', i.circle_id, 'amount', ${MONEY('i.amount', 'i.currency')},
                             'dueOn', to_char(i.due_on, 'YYYY-MM-DD')),
          'due_today:' || i.id, ($2::date)::timestamp AT TIME ZONE 'UTC'
     FROM circle_installments i
    WHERE i.status = 'pending' AND i.due_on = $2::date AND ${ME('i.user_id')}`,
  // Pago recibido o fallido (la cuota venció sin cobrarse).
  `SELECT i.user_id, 'payment_received', 'payments',
          jsonb_build_object('circleId', i.circle_id, 'amount', ${MONEY('i.amount', 'i.currency')},
                             'period', to_char(i.period, 'YYYY-MM')),
          'paid:' || i.id, i.paid_at
     FROM circle_installments i
    WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND ${ME('i.user_id')}`,
  `SELECT i.user_id, 'payment_failed', 'payments',
          jsonb_build_object('circleId', i.circle_id, 'amount', ${MONEY('i.amount', 'i.currency')},
                             'dueOn', to_char(i.due_on, 'YYYY-MM-DD')),
          'failed:' || i.id, (i.due_on + 1)::timestamp AT TIME ZONE 'UTC'
     FROM circle_installments i
    WHERE i.status IN ('overdue', 'defaulted') AND ${ME('i.user_id')}`,
  // Turno de cobro: el mes en que le toca el pozo, y el pozo entregado.
  `SELECT m.user_id, 'payout_turn', 'payments',
          jsonb_build_object('circleId', c.id, 'amount', ${MONEY('c.payout_amount', 'c.currency')},
                             'period', to_char(t.period, 'YYYY-MM')),
          'payout_turn:' || c.id || ':' || to_char(t.period, 'YYYY-MM'),
          t.period::timestamp AT TIME ZONE 'UTC'
     FROM circle_memberships m
     JOIN circles c ON c.id = m.circle_id
     CROSS JOIN LATERAL (SELECT (c.starts_on + make_interval(months => m.position - 1))::date
                           AS period) t
    WHERE c.cycle_state IN ('contributing', 'paused') AND m.expelled_at IS NULL
      AND date_trunc('month', $2::date) = t.period AND ${ME('m.user_id')}`,
  `SELECT p.user_id, 'payout_disbursed', 'payments',
          jsonb_build_object('circleId', p.circle_id, 'amount', ${MONEY('p.amount', 'p.currency')},
                             'period', to_char(p.period, 'YYYY-MM')),
          'payout:' || p.id, p.disbursed_at
     FROM circle_payouts p
    WHERE ${ME('p.user_id')}`,
  // Documentos aprobados o rechazados, y la verificación de identidad decidida.
  `SELECT d.user_id, 'document_' || d.status, 'account',
          jsonb_build_object('documentType', d.type),
          'document:' || d.id || ':' || d.status, d.reviewed_at
     FROM kyc_documents d
    WHERE d.status IN ('approved', 'rejected') AND d.reviewed_at IS NOT NULL
      AND ${ME('d.user_id')}`,
  `SELECT v.user_id, 'document_' || v.status, 'account',
          jsonb_build_object('documentType', 'identity'),
          'identity:' || v.id || ':' || v.status, v.decided_at
     FROM identity_verifications v
    WHERE v.status IN ('approved', 'rejected') AND v.decided_at IS NOT NULL
      AND ${ME('v.user_id')}`,
  // Cambios del círculo: inicio, pausa o reanudación y miembros nuevos mientras se arma.
  `SELECT m.user_id, 'circle_started', 'circles',
          jsonb_build_object('circleId', c.id, 'period', to_char(c.starts_on, 'YYYY-MM')),
          'circle_started:' || c.id, c.starts_on::timestamp AT TIME ZONE 'UTC'
     FROM circle_memberships m
     JOIN circles c ON c.id = m.circle_id
    WHERE c.cycle_state IN ('contributing', 'paused', 'finished') AND c.starts_on <= $2::date
      AND m.expelled_at IS NULL AND ${ME('m.user_id')}`,
  `SELECT m.user_id, 'circle_' || e.action || 'd', 'circles',
          jsonb_build_object('circleId', e.circle_id),
          'circle_' || e.action || ':' || e.id, e.created_at
     FROM circle_admin_events e
     JOIN circle_memberships m ON m.circle_id = e.circle_id AND m.created_at <= e.created_at
    WHERE m.expelled_at IS NULL AND ${ME('m.user_id')}`,
  `SELECT m.user_id, 'circle_member_joined', 'circles',
          jsonb_build_object('circleId', c.id),
          'member_joined:' || o.id, o.created_at
     FROM circle_memberships m
     JOIN circles c ON c.id = m.circle_id
     JOIN circle_memberships o ON o.circle_id = m.circle_id AND o.user_id <> m.user_id
                              AND o.created_at > m.created_at
    WHERE c.cycle_state IN ('collecting', 'approving') AND m.expelled_at IS NULL
      AND ${ME('m.user_id')}`,
];

interface NotificationRow {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  data: NotificationData;
  occurred_at: Date;
  occurred_at_text: string;
  read_at: Date | null;
}

const toNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  type: row.type,
  category: row.category,
  data: row.data,
  occurredAt: new Date(row.occurred_at),
  readAt: row.read_at ? new Date(row.read_at) : null,
});

const encodeCursor = (row: NotificationRow): string =>
  Buffer.from(`${row.occurred_at_text}|${row.id}`).toString('base64url');

function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!at || !id || !isUuid(id) || Number.isNaN(Date.parse(at))) {
    throw new ValidationError('El cursor no es válido', { cursor: 'invalid' });
  }
  return { at, id };
}

@Injectable()
export class SqlNotificationsRepository implements NotificationsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async project(scope: { userId?: string; today: string; dueSoonDays: number }): Promise<number> {
    const created = await this.dataSource.query<unknown[]>(
      `INSERT INTO notifications (user_id, type, category, data, dedupe_key, occurred_at)
       SELECT * FROM (${SOURCES.join('\n UNION ALL \n')}) AS facts
       ON CONFLICT (user_id, dedupe_key) DO NOTHING
       RETURNING 1`,
      [scope.userId ?? null, scope.today, scope.dueSoonDays],
    );
    return created.length;
  }

  async list(
    userId: string,
    filter: NotificationsFilter,
  ): Promise<{ items: Notification[]; nextCursor: string | null }> {
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (filter.category) {
      params.push(filter.category);
      where.push(`category = $${params.length}`);
    }
    if (filter.cursor) {
      const { at, id } = decodeCursor(filter.cursor);
      params.push(at, id);
      where.push(
        `(occurred_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(filter.limit + 1);
    const rows = await this.dataSource.query<NotificationRow[]>(
      `SELECT id, type, category, data, occurred_at, read_at,
              to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS occurred_at_text
         FROM notifications
        WHERE ${where.join(' AND ')}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    const items = rows.slice(0, filter.limit);
    return {
      items: items.map(toNotification),
      nextCursor: rows.length > filter.limit ? encodeCursor(items.at(-1)!) : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return rows[0]?.count ?? 0;
  }

  async markRead(userId: string, ids: readonly string[] | null, at: Date): Promise<number> {
    const [, updated] = await this.dataSource.query<[unknown[], number]>(
      `UPDATE notifications SET read_at = $2
        WHERE user_id = $1 AND read_at IS NULL AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))`,
      [userId, at, ids],
    );
    return updated;
  }
}
