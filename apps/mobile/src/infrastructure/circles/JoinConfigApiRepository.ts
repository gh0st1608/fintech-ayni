import { z } from 'zod';

import type { JoinConfig } from '@/domain/circles/JoinConfig';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';
import { PayoutRange } from '@/domain/circles/value-objects/PayoutRange';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { moneyDto, toMoney } from './moneyDto';

/** DTO de GET /circles/join-config (docs/api/circles.md). */
const joinConfigDto = z.object({
  payout: z.object({ min: moneyDto, max: moneyDto, step: moneyDto }),
  userPayoutLimit: moneyDto.nullable(),
  savingProgramMax: moneyDto,
});

/** Adaptador HTTP de la configuración de unión a círculos. */
export class JoinConfigApiRepository implements JoinConfigRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async get(signal?: AbortSignal): Promise<JoinConfig> {
    const dto = await this.http.get('/circles/join-config', {
      signal,
      parse: (data) => joinConfigDto.parse(data),
    });
    return {
      payoutRange: PayoutRange.create({
        min: toMoney(dto.payout.min),
        max: toMoney(dto.payout.max),
        step: toMoney(dto.payout.step),
      }),
      userPayoutLimit: dto.userPayoutLimit ? toMoney(dto.userPayoutLimit) : undefined,
      savingProgramMax: toMoney(dto.savingProgramMax),
    };
  }
}
