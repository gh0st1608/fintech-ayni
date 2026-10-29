import { z } from 'zod';

import type { JoinCircleRequest, JoinedCircle } from '@/domain/circles/JoinedCircle';
import type { MyCirclesPage, MyCircleStatus } from '@/domain/circles/MyCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { SLOT_TYPE_BY_DTO } from './CircleQuoteApiRepository';
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
  created: z.boolean(),
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
        months: request.months,
        position: request.position,
      },
      parse: (data) => joinedCircleDto.parse(data),
    });
    return {
      ...dto,
      payout: toMoney(dto.payout),
      type: SLOT_TYPE_BY_DTO[dto.type],
      installments: dto.installments.map(toMoney),
      netPayout: toMoney(dto.netPayout),
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
}
