import { z } from 'zod';

import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import type { SavingCatalog, SavingQuote } from '@/domain/savings/SavingPlan';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const period = z.string().regex(/^\d{4}-\d{2}$/);

/** DTO de GET /savings/plans (docs/api/savings.md). */
const catalogDto = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      target: moneyDto,
      maxCashback: moneyDto,
    }),
  ),
  durations: z.array(z.number().int().positive()),
});

/** DTO de GET /savings/plans/:id/quote. */
const quoteDto = z.object({
  planId: z.string().min(1),
  months: z.number().int().positive(),
  monthlyInstallment: moneyDto,
  installments: z.array(moneyDto),
  target: moneyDto,
  cashback: moneyDto,
  total: moneyDto,
  startsOn: period,
  payoutPeriod: period,
});

/** Adaptador HTTP del programa de ahorro (COPAYNI-32 y 33). */
export class SavingPlanApiRepository implements SavingPlanRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(signal?: AbortSignal): Promise<SavingCatalog> {
    const dto = await this.http.get('/savings/plans', {
      signal,
      parse: (data) => catalogDto.parse(data),
    });
    return {
      plans: dto.items.map((plan) => ({
        id: plan.id,
        target: toMoney(plan.target),
        maxCashback: toMoney(plan.maxCashback),
      })),
      durations: dto.durations,
    };
  }

  async quote(planId: string, months: number, signal?: AbortSignal): Promise<SavingQuote> {
    const dto = await this.http.get(`/savings/plans/${encodeURIComponent(planId)}/quote`, {
      query: { months },
      signal,
      parse: (data) => quoteDto.parse(data),
    });
    return {
      ...dto,
      monthlyInstallment: toMoney(dto.monthlyInstallment),
      installments: dto.installments.map(toMoney),
      target: toMoney(dto.target),
      cashback: toMoney(dto.cashback),
      total: toMoney(dto.total),
    };
  }
}
