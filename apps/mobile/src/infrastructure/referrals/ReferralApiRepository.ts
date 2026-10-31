import { z } from 'zod';

import type { ReferralRepositoryPort } from '@/domain/referrals/ports/ReferralRepositoryPort';
import type { InviteeStatus, ReferralInvite, ReferralsPage } from '@/domain/referrals/Referral';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import type { Money } from '@/domain/shared/value-objects/Money';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const STATUS_BY_DTO = {
  registered: 'registered',
  joined_circle: 'joinedCircle',
  first_pay_in_paid: 'firstPayInPaid',
} as const satisfies Record<string, InviteeStatus>;

/** DTO de GET /me/referral (docs/api/referrals.md). */
const inviteDto = z.object({
  code: z.string().min(1),
  link: z.string().min(1),
  reward: moneyDto,
});

/** DTO de GET /me/referrals. */
const referralsDto = z.object({
  earned: moneyDto,
  redeemed: moneyDto,
  balance: moneyDto,
  invitees: z.array(
    z.object({
      displayName: z.string(),
      status: z.enum(['registered', 'joined_circle', 'first_pay_in_paid']),
      claimedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  nextCursor: z.string().min(1).nullable(),
});

const claimDto = z.object({ reward: moneyDto });

/** Adaptador HTTP de los referidos (COPAYNI-51 y 52). */
export class ReferralApiRepository implements ReferralRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async getMine(signal?: AbortSignal): Promise<ReferralInvite> {
    const dto = await this.http.get('/me/referral', {
      signal,
      parse: (data) => inviteDto.parse(data),
    });
    return { code: dto.code, link: dto.link, reward: toMoney(dto.reward) };
  }

  async listReferrals(cursor: string | null, signal?: AbortSignal): Promise<ReferralsPage> {
    const dto = await this.http.get('/me/referrals', {
      query: { cursor },
      signal,
      parse: (data) => referralsDto.parse(data),
    });
    return {
      summary: {
        earned: toMoney(dto.earned),
        redeemed: toMoney(dto.redeemed),
        balance: toMoney(dto.balance),
      },
      invitees: dto.invitees.map((invitee) => ({
        displayName: invitee.displayName,
        status: STATUS_BY_DTO[invitee.status],
        claimedAt: new Date(invitee.claimedAt),
      })),
      nextCursor: dto.nextCursor,
    };
  }

  async claim(code: string): Promise<Money> {
    const dto = await this.http.post('/me/referral/claim', {
      body: { code },
      parse: (data) => claimDto.parse(data),
    });
    return toMoney(dto.reward);
  }
}
