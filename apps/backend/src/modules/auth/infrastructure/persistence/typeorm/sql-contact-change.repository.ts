import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type ContactChange,
  type ContactChangeRepositoryPort,
} from '../../../application/ports/auth.ports';

/** ContactChangeRepositoryPort sobre PostgreSQL (`contact_change_requests`). */
@Injectable()
export class SqlContactChangeRepository implements ContactChangeRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(challengeId: string, change: Omit<ContactChange, 'appliedAt'>): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO contact_change_requests (challenge_id, user_id, type, value)
       VALUES ($1, $2, $3, $4)`,
      [challengeId, change.userId, change.type, change.value],
    );
  }

  async find(challengeId: string): Promise<ContactChange | null> {
    if (!isUuid(challengeId)) return null;
    const [row] = await this.dataSource.query<
      { user_id: string; type: ContactChange['type']; value: string; applied_at: Date | null }[]
    >(
      'SELECT user_id, type, value, applied_at FROM contact_change_requests WHERE challenge_id = $1',
      [challengeId],
    );
    return row
      ? { userId: row.user_id, type: row.type, value: row.value, appliedAt: row.applied_at }
      : null;
  }

  async markApplied(challengeId: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE contact_change_requests SET applied_at = now() WHERE challenge_id = $1',
      [challengeId],
    );
  }
}
