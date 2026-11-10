import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { isUuid } from '../../../../shared/infrastructure/persistence/postgres-errors';
import { type AccountAccessPort } from '../../application/ports/auth.ports';

/** Lee el bloqueo que pone el personal (`users.blocked_at`). */
@Injectable()
export class SqlAccountAccess implements AccountAccessPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isBlocked(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const [row] = await this.dataSource.query<{ blocked: boolean }[]>(
      'SELECT blocked_at IS NOT NULL AS blocked FROM users WHERE id = $1',
      [userId],
    );
    return row?.blocked ?? false;
  }
}
