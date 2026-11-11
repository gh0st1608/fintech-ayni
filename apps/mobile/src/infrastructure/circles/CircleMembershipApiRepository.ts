import { z } from 'zod';

import type { JoinCircleRequest, JoinedCircle } from '@/domain/circles/JoinedCircle';
import type { MyCirclesPage, MyCircleStatus } from '@/domain/circles/MyCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import type { StartDecision, StartProposal } from '@/domain/circles/StartProposal';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { SLOT_TYPE_BY_DTO } from './CircleQuoteApiRepository';
import { Money } from '@/domain/shared/value-objects/Money';

import { moneyDto, toMoney } from './moneyDto';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const slotTypeDto = z.enum(['fastest_payout', 'lowest_fees', 'highest_return']);

/** DTO de POST /circles/join (docs/api/circles.md). */
const joinedCircleDto = z.object({
  circleId: z.string().min(1),
  startsOn: z.string().regex(PERIOD),
  payout: moneyDto,
  months: z.number().int().positive(),
  position: z.number().int().positive(),
  payoutPeriod: z.string().regex(PERIOD),
  type: slotTypeDto,
  installments: z.array(moneyDto).min(1),
  netPayout: moneyDto,
  /** COPAYNI-59; un backend anterior no lo envía. */
  catchUp: moneyDto.optional(),
  /** COPAYNI-60; un backend anterior no lo envía. */
  retention: moneyDto.optional(),
  created: z.boolean(),
});

const startTermsDto = z.object({
  payout: moneyDto,
  baseInstallment: moneyDto,
  months: z.number().int().positive(),
});

/** DTO de GET /me/circles/start-proposals (docs/api/circles.md). */
const startProposalsDto = z.object({
  items: z.array(
    z.object({
      circleId: z.string().min(1),
      round: z.number().int().positive(),
      current: startTermsDto,
      proposed: startTermsDto,
      position: z.number().int().positive(),
      netPayout: moneyDto,
      firstInstallment: moneyDto,
      totalPaid: moneyDto,
      respondBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      decision: z.enum(['accepted', 'withdrawn']).nullable(),
    }),
  ),
});

const toStartTerms = (dto: z.infer<typeof startTermsDto>) => ({
  payout: toMoney(dto.payout),
  baseInstallment: toMoney(dto.baseInstallment),
  months: dto.months,
});

/** DTO de GET /me/circles (docs/api/circles.md). */
const myCirclesDto = z.object({
  items: z.array(
    z.object({
      circleId: z.string().min(1),
      status: z.enum(['active', 'finished']),
      payout: moneyDto,
      months: z.number().int().positive(),
      startsOn: z.string().regex(PERIOD),
      endsOn: z.string().regex(PERIOD),
      position: z.number().int().positive(),
      payoutPeriod: z.string().regex(PERIOD),
      type: slotTypeDto,
      installments: z.array(moneyDto).min(1),
      adminFee: moneyDto,
      netPayout: moneyDto,
      joinedAt: z.iso.datetime({ offset: true }),
      expelled: z.boolean(),
    }),
  ),
  nextCursor: z.string().min(1).nullable(),
});

/** Adaptador HTTP de las membresías: unirse (COPAYNI-31) y mis círculos (COPAYNI-26). */
export class CircleMembershipApiRepository implements CircleMembershipRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async join(request: JoinCircleRequest, idempotencyKey: string): Promise<JoinedCircle> {
    const dto = await this.http.post('/circles/join', {
      idempotencyKey,
      body: {
        circleId: request.circleId,
        payoutAmount: request.payout.amount,
        currency: request.payout.currency,
        months: request.months,
        position: request.position,
        termsVersion: request.termsVersion,
      },
      parse: (data) => joinedCircleDto.parse(data),
    });
    return {
      ...dto,
      payout: toMoney(dto.payout),
      type: SLOT_TYPE_BY_DTO[dto.type],
      installments: dto.installments.map(toMoney),
      netPayout: toMoney(dto.netPayout),
      catchUp: dto.catchUp ? toMoney(dto.catchUp) : Money.of(0, dto.payout.currency),
      retention: dto.retention ? toMoney(dto.retention) : Money.of(0, dto.payout.currency),
    };
  }

  async listMine(
    status: MyCircleStatus,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<MyCirclesPage> {
    const dto = await this.http.get('/me/circles', {
      query: { status, cursor },
      signal,
      parse: (data) => myCirclesDto.parse(data),
    });
    return {
      items: dto.items.map((item) => ({
        ...item,
        payout: toMoney(item.payout),
        type: SLOT_TYPE_BY_DTO[item.type],
        installments: item.installments.map(toMoney),
        adminFee: toMoney(item.adminFee),
        netPayout: toMoney(item.netPayout),
        joinedAt: new Date(item.joinedAt),
      })),
      nextCursor: dto.nextCursor,
    };
  }

  async listStartProposals(signal?: AbortSignal): Promise<StartProposal[]> {
    const { items } = await this.http.get('/me/circles/start-proposals', {
      signal,
      parse: (data) => startProposalsDto.parse(data),
    });
    return items.map((item) => ({
      ...item,
      current: toStartTerms(item.current),
      proposed: toStartTerms(item.proposed),
      netPayout: toMoney(item.netPayout),
      firstInstallment: toMoney(item.firstInstallment),
      totalPaid: toMoney(item.totalPaid),
    }));
  }

  async respondStartProposal(
    circleId: string,
    decision: StartDecision,
    round: number,
  ): Promise<void> {
    const action = decision === 'accepted' ? 'accept' : 'withdraw';
    await this.http.post(`/me/circles/${circleId}/start-proposal/${action}`, { body: { round } });
  }
}
