import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import type { SavingCatalog, SavingQuote } from '@/domain/savings/SavingPlan';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Los supuestos provisionales del backend (R6, M6): montos en unidades menores. */
const DEFAULT_PLANS: Record<string, number> = {
  lite: 300000,
  bronze: 600000,
  silver: 1200000,
  gold: 3000000,
  platinum: 6000000,
  diamond: 10000000,
};
/** Cashback por duración en puntos básicos: 5 % a 6 meses, 10 % a 12 y 20 % a 24. */
const CASHBACK_BPS: Record<number, number> = { 6: 500, 12: 1000, 24: 2000 };

function addMonths(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Programa de ahorro falso (solo dev y pruebas), con el mismo cálculo que el backend. */
export class InMemorySavingPlanRepository implements SavingPlanRepositoryPort {
  private readonly latencyMs: number;
  private readonly currency: string;
  private readonly plans: Record<string, number>;
  private readonly now: () => Date;

  constructor(options: {
    currency: string;
    latencyMs?: number;
    plans?: Record<string, number>;
    now?: () => Date;
  }) {
    this.currency = options.currency;
    this.latencyMs = options.latencyMs ?? 300;
    this.plans = options.plans ?? DEFAULT_PLANS;
    this.now = options.now ?? (() => new Date());
  }

  async list(signal?: AbortSignal): Promise<SavingCatalog> {
    await simulateLatency(this.latencyMs, signal);
    const longest = Math.max(...Object.keys(CASHBACK_BPS).map(Number));
    return {
      plans: Object.entries(this.plans).map(([id, target]) => ({
        id,
        target: this.money(target),
        maxCashback: this.money(this.cashback(target, longest)),
      })),
      durations: Object.keys(CASHBACK_BPS).map(Number),
    };
  }

  async quote(planId: string, months: number, signal?: AbortSignal): Promise<SavingQuote> {
    await simulateLatency(this.latencyMs, signal);
    const target = this.plans[planId];
    if (target === undefined) {
      throw new AppError('not_found', 'Saving plan not found', {
        status: 404,
        code: 'SAVING_PLAN_NOT_FOUND',
      });
    }
    if (!(months in CASHBACK_BPS)) {
      throw new AppError('validation', 'Duration not offered', { status: 400 });
    }
    const base = Math.floor(target / months);
    const remainder = target % months;
    const installments = Array.from({ length: months }, (_, index) =>
      this.money(base + (index < remainder ? 1 : 0)),
    );
    const cashback = this.cashback(target, months);
    const today = this.now();
    const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const startsOn = addMonths(current, 1);
    return {
      planId,
      months,
      monthlyInstallment: installments[0]!,
      installments,
      target: this.money(target),
      cashback: this.money(cashback),
      total: this.money(target + cashback),
      startsOn,
      payoutPeriod: addMonths(startsOn, months),
    };
  }

  private cashback(target: number, months: number): number {
    return Math.floor((target * (CASHBACK_BPS[months] ?? 0)) / 10_000);
  }

  private money(amount: number): Money {
    return Money.of(amount, this.currency);
  }
}
