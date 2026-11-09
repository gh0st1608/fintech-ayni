import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../../shared/domain/value-objects/money';
import { isUuid } from '../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type AdminUserDetail,
  type AdminUserLookup,
  type AdminUserRecord,
  type AdminUsersQueryPort,
  type KycDocumentState,
} from '../../application/ports/admin-users-query.port';
import { type UserStatus } from '../../domain/entities/user';

interface UserRow {
  id: string;
  status: UserStatus;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_language: string | null;
  created_at: Date;
}

const USER_COLUMNS = `u.id, u.status, u.email, u.phone, u.first_name, u.last_name,
  u.preferred_language, u.created_at`;

const toRecord = (row: UserRow): AdminUserRecord => ({
  userId: row.id,
  status: row.status,
  email: row.email,
  phone: row.phone,
  firstName: row.first_name,
  lastName: row.last_name,
  preferredLanguage: row.preferred_language,
  createdAt: new Date(row.created_at),
});

/** Columna de `users` para cada criterio. Lista cerrada: nunca se arma SQL con el valor. */
const LOOKUP_COLUMN = { id: 'u.id', email: 'u.email', phone: 'u.phone' } as const;

/** Lecturas del back-office sobre las personas, en SQL de solo lectura. */
@Injectable()
export class SqlAdminUsersQuery implements AdminUsersQueryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(lookup: AdminUserLookup): Promise<AdminUserRecord[]> {
    if (lookup.by === 'id' && !isUuid(lookup.value)) return [];
    const rows = await this.dataSource.query<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users u WHERE ${LOOKUP_COLUMN[lookup.by]} = $1 LIMIT 10`,
      [lookup.value],
    );
    return rows.map(toRecord);
  }

  async find(userId: string): Promise<AdminUserDetail | null> {
    if (!isUuid(userId)) return null;
    const [user] = await this.dataSource.query<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (!user) return null;

    // El estado del documento más reciente de cada tipo.
    const documents = await this.dataSource.query<{ type: string; status: KycDocumentState }[]>(
      `SELECT DISTINCT ON (type) type, status FROM kyc_documents
        WHERE user_id = $1 ORDER BY type, submitted_at DESC, id DESC`,
      [userId],
    );
    const latest = new Map(documents.map((document) => [document.type, document.status]));

    const circles = await this.dataSource.query<
      {
        circle_id: string;
        cycle_state: string;
        payout_amount: string;
        currency: string;
        months: number;
        position: number;
        created_at: Date;
        expelled_at: Date | null;
      }[]
    >(
      `SELECT c.id AS circle_id, c.cycle_state, c.payout_amount::text AS payout_amount, c.currency,
              c.months, m.position, m.created_at, m.expelled_at
         FROM circle_memberships m JOIN circles c ON c.id = m.circle_id
        WHERE m.user_id = $1
        ORDER BY m.created_at DESC, c.id`,
      [userId],
    );

    return {
      ...toRecord(user),
      kyc: {
        national_id: latest.get('national_id') ?? 'not_submitted',
        proof_of_income: latest.get('proof_of_income') ?? 'not_submitted',
        additional: latest.get('additional') ?? 'not_submitted',
      },
      circles: circles.map((row) => ({
        circleId: row.circle_id,
        state: row.cycle_state,
        payout: Money.of(Number(row.payout_amount), row.currency.trim()),
        months: row.months,
        position: row.position,
        joinedAt: new Date(row.created_at),
        expelledAt: row.expelled_at ? new Date(row.expelled_at) : null,
      })),
    };
  }
}
