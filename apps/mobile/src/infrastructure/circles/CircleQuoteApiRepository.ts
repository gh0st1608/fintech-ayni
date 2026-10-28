import { z } from 'zod';

import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import type { Money } from '@/domain/shared/value-objects/Money';

import { moneyDto, toMoney } from './moneyDto';

/** DTO de GET /circles/installment-options (docs/api/circles.md). */
const installmentOptionsDto = z.object({
  payout: moneyDto,
  options: z.array(
    z.object({
      months: z.number().int().positive(),
      installment: moneyDto,
      /** Propuesto para R5; si el backend no lo envía, la opción no se restringe. */
      withinMonthlyLimit: z.boolean().optional(),
    }),
  ),
});

/** Adaptador HTTP de la cotización de un Game'ya. */
export class CircleQuoteApiRepository implements CircleQuoteRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async listInstallmentOptions(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]> {
    const dto = await this.http.get('/circles/installment-options', {
      query: { payoutAmount: payout.amount },
      signal,
      parse: (data) => installmentOptionsDto.parse(data),
    });
    return dto.options.map((option) =>
      InstallmentOption.create({
        months: option.months,
        installment: toMoney(option.installment),
        withinMonthlyLimit: option.withinMonthlyLimit,
      }),
    );
  }
}
