import { z } from 'zod';

import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import type { SavingCatalog, SavingQuote } from '@/domain/savings/SavingPlan';
import type { SavingSubscription, SubscribeInput } from '@/domain/savings/SavingSubscription';
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

/** DTO de la suscripción (POST /savings/subscriptions y GET /me/savings). */
const subscriptionDto = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  months: z.number().int().positive(),
  status: z.enum(['pending', 'active', 'completed']),
  target: moneyDto,
  cashback: moneyDto,
  saved: moneyDto,
  paidContributions: z.number().int().nonnegative(),
  nextContribution: z
    .object({ sequence: z.number().int(), dueOn: z.string(), amount: moneyDto })
    .nullable(),
  payoutPeriod: period,
  autoDebit: z.boolean(),
  card: z.string().nullable(),
});

const toSubscription = (dto: z.infer<typeof subscriptionDto>): SavingSubscription => ({
  ...dto,
  target: toMoney(dto.target),
  cashback: toMoney(dto.cashback),
  saved: toMoney(dto.saved),
  nextContribution: dto.nextContribution
    ? { ...dto.nextContribution, amount: toMoney(dto.nextContribution.amount) }
    : null,
});

/** Adaptador HTTP del programa de ahorro (COPAYNI-32, 33 y 79). */
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

  async subscribe(input: SubscribeInput, idempotencyKey: string): Promise<SavingSubscription> {
    const dto = await this.http.post('/savings/subscriptions', {
      body: input,
      idempotencyKey,
      parse: (data) => subscriptionDto.parse(data),
    });
    return toSubscription(dto);
  }

  async mine(signal?: AbortSignal): Promise<SavingSubscription[]> {
    const dto = await this.http.get('/me/savings', {
      signal,
      parse: (data) => z.object({ items: z.array(subscriptionDto) }).parse(data),
    });
    return dto.items.map(toSubscription);
  }
}
