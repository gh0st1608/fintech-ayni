import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { type Money } from '../../../shared/domain/value-objects/money';
import {
  isUuid,
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../shared/infrastructure/persistence/postgres-errors';
import { InvalidCursorError } from '../../circles/application/ports/circle-repository.port';
import { LoginIdentifier } from '../../users/domain/value-objects/login-identifier';
import {
  type InviteePage,
  type InviteeStatus,
  type ReferralRepositoryPort,
  type ReferralTotals,
} from '../application/ports/referral-repository.port';

const TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

const encodeCursor = (claimedAt: string, id: string): string =>
  Buffer.from(JSON.stringify([claimedAt, id])).toString('base64url');

function decodeCursor(cursor: string): [string, string] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [claimedAt, id] = parsed as unknown[];
      if (
        typeof claimedAt === 'string' &&
        TIMESTAMPTZ.test(claimedAt) &&
        typeof id === 'string' &&
        isUuid(id)
      ) {
        return [claimedAt, id];
      }
    }
  } catch {
    // Cae al error de abajo: un cursor que no es JSON no lo generó este repositorio.
  }
  throw new InvalidCursorError();
}

/** Nombre e inicial del apellido; sin nombre, el email o el teléfono enmascarados. */
function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}): string {
  if (row.first_name) {
    return row.last_name ? `${row.first_name} ${row.last_name[0]}.` : row.first_name;
  }
  if (row.email) return LoginIdentifier.parse(row.email, 'email').masked();
  if (row.phone) return LoginIdentifier.parse(row.phone, 'phone').masked();
  return '—';
}

/** Cuotas que cuentan como pagadas para el primer pay-in (también la descontada del payout). */
const PAID = "('paid', 'deducted')";
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

  async totalsOf(userId: string, maxRewardedInvites: number): Promise<ReferralTotals> {
    if (!isUuid(userId)) return { earned: 0, redeemed: 0 };
    const [row] = await this.dataSource.query<{ earned: string; redeemed: string }[]>(
      `SELECT (COALESCE((SELECT reward_amount FROM referrals WHERE invitee_id = $1), 0)
               + COALESCE((SELECT sum(q.reward_amount) FROM (
                   SELECT r.reward_amount FROM referrals r
                    WHERE r.inviter_id = $1
                          AND EXISTS (SELECT 1 FROM circle_installments i
                                       WHERE i.user_id = r.invitee_id AND i.status IN ${PAID})
                    ORDER BY r.claimed_at, r.invitee_id
                    LIMIT $2) q), 0))::text AS earned,
              COALESCE((SELECT sum(amount) FROM referral_redemptions WHERE user_id = $1), 0)::text
                AS redeemed`,
      [userId, maxRewardedInvites],
    );
    return { earned: Number(row?.earned ?? 0), redeemed: Number(row?.redeemed ?? 0) };
  }

  async inviteesOf(userId: string, limit: number, cursor: string | null): Promise<InviteePage> {
    const after = cursor === null ? null : decodeCursor(cursor);
    if (!isUuid(userId)) return { items: [], nextCursor: null };
    const params: unknown[] = [userId, limit + 1];
    let keyset = '';
    if (after) {
      params.push(...after);
      keyset = 'AND (r.claimed_at, r.invitee_id) < ($3::timestamptz, $4::uuid)';
    }
    const rows = await this.dataSource.query<
      {
        invitee_id: string;
        claimed_at: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        status: InviteeStatus;
      }[]
    >(
      `SELECT r.invitee_id, r.claimed_at::text AS claimed_at, u.first_name, u.last_name, u.email,
              u.phone,
              CASE
                WHEN EXISTS (SELECT 1 FROM circle_installments i
                              WHERE i.user_id = r.invitee_id AND i.status IN ${PAID})
                  THEN 'first_pay_in_paid'
                WHEN EXISTS (SELECT 1 FROM circle_memberships m WHERE m.user_id = r.invitee_id)
                  THEN 'joined_circle'
                ELSE 'registered'
              END AS status
         FROM referrals r JOIN users u ON u.id = r.invitee_id
        WHERE r.inviter_id = $1 ${keyset}
        ORDER BY r.claimed_at DESC, r.invitee_id DESC
        LIMIT $2`,
      params,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        displayName: displayName(row),
        status: row.status,
        claimedAt: new Date(row.claimed_at),
      })),
      nextCursor:
        rows.length > limit && last ? encodeCursor(last.claimed_at, last.invitee_id) : null,
    };
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
