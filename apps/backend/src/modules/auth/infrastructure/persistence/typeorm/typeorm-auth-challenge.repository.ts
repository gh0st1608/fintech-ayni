import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import { type AuthChallengeRepositoryPort } from '../../../application/ports/auth.ports';
import { AuthChallenge } from '../../../domain/entities/auth-challenge';
import { AuthChallengeEntity } from './auth.entities';

@Injectable()
export class TypeOrmAuthChallengeRepository implements AuthChallengeRepositoryPort {
  constructor(
    @InjectRepository(AuthChallengeEntity)
    private readonly challenges: Repository<AuthChallengeEntity>,
  ) {}

  async create(challenge: AuthChallenge): Promise<void> {
    await this.challenges.insert({ ...challenge.snapshot });
  }

  async update<T>(id: string, change: (challenge: AuthChallenge) => T): Promise<T | null> {
    if (!isUuid(id)) return null;
    return this.challenges.manager.transaction(async (manager) => {
      // SELECT … FOR UPDATE: los intentos simultáneos sobre el mismo desafío se serializan.
      const row = await manager.findOne(AuthChallengeEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) return null;
      const challenge = AuthChallenge.restore(row);
      const result = change(challenge);
      const {
        codeHash,
        status,
        attemptsRemaining,
        resendsRemaining,
        expiresAt,
        resendAvailableAt,
      } = challenge.snapshot;
      await manager.update(
        AuthChallengeEntity,
        { id },
        { codeHash, status, attemptsRemaining, resendsRemaining, expiresAt, resendAvailableAt },
      );
      return result;
    });
  }

  async issuedSince(userId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
    const row = await this.challenges
      .createQueryBuilder('challenge')
      .select('count(*)::int', 'count')
      .addSelect('min(challenge.created_at)', 'oldest')
      .where('challenge.user_id = :userId AND challenge.created_at > :since', { userId, since })
      .getRawOne<{ count: number; oldest: Date | null }>();
    return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
  }
}
