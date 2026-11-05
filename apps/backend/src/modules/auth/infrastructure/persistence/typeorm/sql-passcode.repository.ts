import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  type PasscodeRepositoryPort,
  type StoredPasscode,
} from '../../../application/ports/passcode.ports';

/** PasscodeRepositoryPort sobre PostgreSQL (`user_passcodes`). */
@Injectable()
export class SqlPasscodeRepository implements PasscodeRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(userId: string): Promise<StoredPasscode | null> {
    const [row] = await this.dataSource.query<{ hash: string; locked_until: Date | null }[]>(
      'SELECT hash, locked_until FROM user_passcodes WHERE user_id = $1',
      [userId],
    );
    return row ? { hash: row.hash, lockedUntil: row.locked_until } : null;
  }

  async save(userId: string, hash: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO user_passcodes (user_id, hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET hash = EXCLUDED.hash, failed_attempts = 0, locked_until = NULL, updated_at = now()`,
      [userId, hash],
    );
  }

  async recordFailure(userId: string, maxAttempts: number, lockUntil: Date): Promise<number> {
    const [[row]] = await this.dataSource.query<[{ failures: number }[], number]>(
      `WITH previous AS (
         SELECT failed_attempts + 1 AS failures FROM user_passcodes WHERE user_id = $1 FOR UPDATE
       )
       UPDATE user_passcodes SET
         failed_attempts = CASE WHEN previous.failures >= $2 THEN 0 ELSE previous.failures END,
         locked_until = CASE WHEN previous.failures >= $2 THEN $3::timestamptz ELSE locked_until END
       FROM previous WHERE user_id = $1
       RETURNING previous.failures`,
      [userId, maxAttempts, lockUntil],
    );
    return row?.failures ?? maxAttempts;
  }

  async clearFailures(userId: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE user_passcodes SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1',
      [userId],
    );
  }
}
