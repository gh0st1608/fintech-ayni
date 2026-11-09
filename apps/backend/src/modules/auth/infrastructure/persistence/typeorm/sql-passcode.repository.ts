import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import {
  type LockedPasscode,
  type PasscodeRepositoryPort,
  type StoredPasscode,
} from '../../../application/ports/passcode.ports';

type Queryable = Pick<EntityManager, 'query'>;

async function findPasscode(db: Queryable, userId: string): Promise<StoredPasscode | null> {
  const [row] = await db.query<{ hash: string; locked_until: Date | null }[]>(
    'SELECT hash, locked_until FROM user_passcodes WHERE user_id = $1',
    [userId],
  );
  return row ? { hash: row.hash, lockedUntil: row.locked_until } : null;
}

/**
 * PasscodeRepositoryPort sobre PostgreSQL (`user_passcodes`). `withLock` usa un advisory lock por
 * usuario, que también protege la creación, cuando todavía no hay fila que bloquear.
 */
@Injectable()
export class SqlPasscodeRepository implements PasscodeRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  find(userId: string): Promise<StoredPasscode | null> {
    return findPasscode(this.dataSource, userId);
  }

  withLock<T>(userId: string, work: (locked: LockedPasscode) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `passcode:${userId}`,
      ]);
      return work(new SqlLockedPasscode(manager, userId));
    });
  }
}

class SqlLockedPasscode implements LockedPasscode {
  constructor(
    private readonly manager: EntityManager,
    private readonly userId: string,
  ) {}

  find(): Promise<StoredPasscode | null> {
    return findPasscode(this.manager, this.userId);
  }

  async save(hash: string): Promise<void> {
    await this.manager.query(
      `INSERT INTO user_passcodes (user_id, hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET hash = EXCLUDED.hash, failed_attempts = 0, locked_until = NULL, updated_at = now()`,
      [this.userId, hash],
    );
  }

  async recordFailure(maxAttempts: number, lockUntil: Date): Promise<number> {
    const [[row]] = await this.manager.query<[{ failures: number }[], number]>(
      `WITH previous AS (
         SELECT failed_attempts + 1 AS failures FROM user_passcodes WHERE user_id = $1
       )
       UPDATE user_passcodes SET
         failed_attempts = CASE WHEN previous.failures >= $2 THEN 0 ELSE previous.failures END,
         locked_until = CASE WHEN previous.failures >= $2 THEN $3::timestamptz ELSE locked_until END
       FROM previous WHERE user_id = $1
       RETURNING previous.failures`,
      [this.userId, maxAttempts, lockUntil],
    );
    return row?.failures ?? maxAttempts;
  }

  async clearFailures(): Promise<void> {
    await this.manager.query(
      'UPDATE user_passcodes SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1',
      [this.userId],
    );
  }
}
