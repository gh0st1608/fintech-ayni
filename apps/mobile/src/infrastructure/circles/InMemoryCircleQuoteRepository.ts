import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryCircleQuoteOptions {
  latencyMs?: number;
  /** Duraciones ofrecidas; por defecto las del Figma (6, 10 y 12 meses). */
  durations?: number[];
  /** Límite mensual de pay-in en unidades mayores (R5); sin él no se restringe. */
  monthlyPayInLimit?: number;
}

/**
 * Cotización falsa (contract-first) con la misma regla provisional que el backend: cuota base
 * = payout / meses, solo para las duraciones que dan cuotas exactas en céntimos.
 */
export class InMemoryCircleQuoteRepository implements CircleQuoteRepositoryPort {
  private readonly latencyMs: number;

  constructor(private readonly options: InMemoryCircleQuoteOptions = {}) {
    this.latencyMs = options.latencyMs ?? 400;
  }

  async listInstallmentOptions(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]> {
    await simulateLatency(this.latencyMs, signal);
    const { durations = [6, 10, 12], monthlyPayInLimit } = this.options;
    const limit =
      monthlyPayInLimit === undefined
        ? undefined
        : Money.fromMajor(monthlyPayInLimit, payout.currency);

    return durations
      .filter((months) => payout.amount % months === 0)
      .map((months) => {
        const installment = Money.of(payout.amount / months, payout.currency);
        return InstallmentOption.create({
          months,
          installment,
          withinMonthlyLimit: !limit || installment.amount <= limit.amount,
        });
      });
  }
}
