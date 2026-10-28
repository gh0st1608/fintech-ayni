import { z } from 'zod';

import type { JoinCircleRequest, JoinedCircle } from '@/domain/circles/JoinedCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { SLOT_TYPE_BY_DTO } from './CircleQuoteApiRepository';
import { moneyDto, toMoney } from './moneyDto';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** DTO de POST /circles/join (docs/api/circles.md). */
const joinedCircleDto = z.object({
  circleId: z.string().min(1),
  startsOn: z.string().regex(PERIOD),
  payout: moneyDto,
  months: z.number().int().positive(),
  position: z.number().int().positive(),
  payoutPeriod: z.string().regex(PERIOD),
  type: z.enum(['fastest_payout', 'lowest_fees', 'highest_return']),
  installments: z.array(moneyDto).min(1),
  netPayout: moneyDto,
  created: z.boolean(),
});

/** Adaptador HTTP de la unión a un Game'ya (COPAYNI-31). */
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
}
