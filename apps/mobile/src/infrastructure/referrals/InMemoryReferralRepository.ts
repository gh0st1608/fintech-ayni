import type { ReferralRepositoryPort } from '@/domain/referrals/ports/ReferralRepositoryPort';
import type { Invitee, ReferralInvite, ReferralsPage } from '@/domain/referrals/Referral';
import { parseReferralCode } from '@/domain/referrals/ReferralCode';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Mi código en el fake: un código de otro usuario es cualquiera con formato válido. */
export const FAKE_OWN_REFERRAL_CODE = 'K7M2Q9XA';
const REWARD = 15000;

const DEFAULT_INVITEES: Invitee[] = [
  { displayName: 'Ana Q.', status: 'firstPayInPaid', claimedAt: new Date('2026-10-20T15:00:00Z') },
  { displayName: 'Luis R.', status: 'joinedCircle', claimedAt: new Date('2026-10-12T15:00:00Z') },
  {
    displayName: 'ro***@mail.com',
    status: 'registered',
    claimedAt: new Date('2026-10-02T15:00:00Z'),
  },
];

/**
 * Referidos falsos (solo dev y pruebas), con las reglas provisionales del backend (R7): el
 * beneficio se gana cuando el invitado paga su primera cuota.
 */
export class InMemoryReferralRepository implements ReferralRepositoryPort {
  invitees: Invitee[];
  redeemed: number;
  claimed: string | null = null;
  private readonly latencyMs: number;
  private readonly currency: string;
  private readonly pageSize: number;

  constructor(options: {
    currency: string;
    latencyMs?: number;
    invitees?: Invitee[];
    redeemed?: number;
    pageSize?: number;
  }) {
    this.currency = options.currency;
    this.latencyMs = options.latencyMs ?? 300;
    this.invitees = [...(options.invitees ?? DEFAULT_INVITEES)];
    this.redeemed = options.redeemed ?? 0;
    this.pageSize = options.pageSize ?? 20;
  }

  async getMine(signal?: AbortSignal): Promise<ReferralInvite> {
    await simulateLatency(this.latencyMs, signal);
    return {
      code: FAKE_OWN_REFERRAL_CODE,
      link: `ayni://invite?code=${FAKE_OWN_REFERRAL_CODE}`,
      reward: this.money(REWARD),
    };
  }

  async listReferrals(cursor: string | null, signal?: AbortSignal): Promise<ReferralsPage> {
    await simulateLatency(this.latencyMs, signal);
    const paid = this.invitees.filter(({ status }) => status === 'firstPayInPaid').length;
    const earned = (paid + (this.claimed ? 1 : 0)) * REWARD;
    const start = cursor ? Number(cursor) : 0;
    const end = start + this.pageSize;
    return {
      summary: {
        earned: this.money(earned),
        redeemed: this.money(this.redeemed),
        balance: this.money(earned - this.redeemed),
      },
      invitees: this.invitees.slice(start, end),
      nextCursor: end < this.invitees.length ? String(end) : null,
    };
  }

  async claim(raw: string): Promise<Money> {
    await simulateLatency(this.latencyMs);
    const code = parseReferralCode(raw);
    if (code === FAKE_OWN_REFERRAL_CODE) {
      throw new AppError('business', 'Own referral code', {
        status: 422,
        code: 'OWN_REFERRAL_CODE',
      });
    }
    if (this.claimed) {
      throw new AppError('conflict', 'Already claimed', {
        status: 409,
        code: 'REFERRAL_ALREADY_CLAIMED',
      });
    }
    this.claimed = code;
    return this.money(REWARD);
  }

  private money(amount: number): Money {
    return Money.of(amount, this.currency);
  }
}
