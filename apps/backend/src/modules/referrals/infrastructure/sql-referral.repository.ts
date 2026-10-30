import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { type Money } from '../../../shared/domain/value-objects/money';
import {
  isUuid,
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../shared/infrastructure/persistence/postgres-errors';
import { type ReferralRepositoryPort } from '../application/ports/referral-repository.port';
import { ReferralCode } from '../domain/referral-code';

/** ReferralRepositoryPort sobre PostgreSQL (`referral_codes` y `referrals`). */
@Injectable()
export class SqlReferralRepository implements ReferralRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async codeOf(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [existing] = await this.dataSource.query<{ code: string }[]>(
        'SELECT code FROM referral_codes WHERE user_id = $1',
        [userId],
      );
      if (existing) return existing.code;
      try {
        await this.dataSource.query(
          `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, ReferralCode.generate()],
        );
      } catch (error) {
        // Otro usuario ya tiene ese código: se intenta con otro.
        if (!violatedConstraint(error, PG_UNIQUE_VIOLATION)) throw error;
      }
    }
    throw new Error('No se pudo generar un código de invitación único');
  }

  async ownerOf(code: string): Promise<string | null> {
    const [row] = await this.dataSource.query<{ user_id: string }[]>(
      'SELECT user_id FROM referral_codes WHERE code = $1',
      [code],
    );
    return row?.user_id ?? null;
  }

  async inviterOf(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<{ inviter_id: string }[]>(
      'SELECT inviter_id FROM referrals WHERE invitee_id = $1',
      [userId],
    );
    return row?.inviter_id ?? null;
  }

  async hasJoinedACircle(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const [row] = await this.dataSource.query<unknown[]>(
      'SELECT 1 FROM circle_memberships WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    return row !== undefined;
  }

  async claim(inviteeId: string, inviterId: string, reward: Money): Promise<boolean> {
    const inserted = await this.dataSource.query<unknown[]>(
      `INSERT INTO referrals (invitee_id, inviter_id, reward_amount, currency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (invitee_id) DO NOTHING
       RETURNING invitee_id`,
      [inviteeId, inviterId, reward.amount, reward.currency],
    );
    return inserted.length > 0;
  }
}
