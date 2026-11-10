import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { isUuid } from '../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type AdminUserActionsPort,
  type SupportNote,
  type UserContact,
} from '../../application/ports/admin-user-actions.port';

interface NoteRow {
  id: string;
  body: string;
  author_id: string;
  author_email: string | null;
  created_at: Date;
}

const toNote = (row: NoteRow): SupportNote => ({
  id: row.id,
  body: row.body,
  authorId: row.author_id,
  authorEmail: row.author_email,
  createdAt: new Date(row.created_at),
});

/** Sesiones vigentes revocadas: las familias de refresh tokens que seguían abiertas. */
async function revokeAll(manager: EntityManager, userId: string, now: Date): Promise<number> {
  const [rows] = await manager.query<[{ family_id: string }[], number]>(
    `UPDATE refresh_tokens SET revoked_at = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
      RETURNING family_id`,
    [userId, now],
  );
  return new Set(rows.map((row) => row.family_id)).size;
}

async function exists(manager: EntityManager, userId: string): Promise<boolean> {
  const [row] = await manager.query<unknown[]>('SELECT 1 FROM users WHERE id = $1', [userId]);
  return row !== undefined;
}

/** Acciones de soporte del back-office sobre `users`, `refresh_tokens` y `support_notes`. */
@Injectable()
export class SqlAdminUserActions implements AdminUserActionsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async revokeSessions(userId: string, now: Date): Promise<number | null> {
    if (!isUuid(userId)) return null;
    return this.dataSource.transaction(async (manager) =>
      (await exists(manager, userId)) ? revokeAll(manager, userId, now) : null,
    );
  }

  async setBlocked(
    userId: string,
    block: { reason: string } | null,
    now: Date,
  ): Promise<{ changed: boolean; revokedSessions: number } | null> {
    if (!isUuid(userId)) return null;
    return this.dataSource.transaction(async (manager) => {
      if (!(await exists(manager, userId))) return null;
      const [, changed] = await manager.query<[unknown, number]>(
        block
          ? `UPDATE users SET blocked_at = $2, blocked_reason = $3
              WHERE id = $1 AND blocked_at IS NULL`
          : `UPDATE users SET blocked_at = NULL, blocked_reason = NULL
              WHERE id = $1 AND blocked_at IS NOT NULL`,
        block ? [userId, now, block.reason] : [userId],
      );
      // Al bloquear se cierran también las sesiones abiertas, aunque ya estuviera bloqueada.
      const revokedSessions = block ? await revokeAll(manager, userId, now) : 0;
      return { changed: changed === 1, revokedSessions };
    });
  }

  async contact(userId: string): Promise<UserContact | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<
      {
        email: string | null;
        phone: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]
    >('SELECT email, phone, first_name, last_name FROM users WHERE id = $1', [userId]);
    return row
      ? { email: row.email, phone: row.phone, firstName: row.first_name, lastName: row.last_name }
      : null;
  }

  async notes(userId: string): Promise<SupportNote[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.dataSource.query<NoteRow[]>(
      `SELECT id, body, author_id, author_email, created_at FROM support_notes
        WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
      [userId],
    );
    return rows.map(toNote);
  }

  async addNote(note: {
    userId: string;
    body: string;
    authorId: string;
    authorEmail: string | null;
  }): Promise<SupportNote | null> {
    if (!isUuid(note.userId)) return null;
    const [row] = await this.dataSource.query<NoteRow[]>(
      `INSERT INTO support_notes (user_id, body, author_id, author_email)
       SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
       RETURNING id, body, author_id, author_email, created_at`,
      [note.userId, note.body, note.authorId, note.authorEmail],
    );
    return row ? toNote(row) : null;
  }
}
