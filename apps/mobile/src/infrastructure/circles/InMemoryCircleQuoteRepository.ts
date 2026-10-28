import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { Slot, type SlotType } from '@/domain/circles/value-objects/Slot';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryCircleQuoteOptions {
  latencyMs?: number;
  /** Duraciones ofrecidas; por defecto las del Figma (6, 10 y 12 meses). */
  durations?: number[];
  /** Límite mensual de pay-in en unidades mayores (R5); sin él no se restringe. */
  monthlyPayInLimit?: number;
  /** Posiciones ya ocupadas en cualquier círculo; por defecto ninguna. */
  takenPositions?: number[];
  /** Primer mes del círculo (YYYY-MM); por defecto, el mes siguiente al actual. */
  startsOn?: string;
  /** Círculo ofrecido; por defecto `null`, uno nuevo, como el backend sin círculos abiertos. */
  circleId?: string | null;
}

/**
 * Parámetros provisionales, los mismos que las pruebas del backend (pending-scope R1): 25 % de
 * slots Fastest con fee de hasta el 10 % del payout y 25 % Highest con descuento de hasta el 5 %.
 */
const FASTEST_SHARE = 0.25;
const HIGHEST_SHARE = 0.25;
const MAX_FEE_BPS = 1_000;
const MAX_DISCOUNT_BPS = 500;

function nextMonth(): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year! * 12 + (month! - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Porcentaje del payout en puntos básicos, escalado linealmente (`step / steps`). */
function share(payout: Money, bps: number, step: number, steps: number): Money {
  return Money.of(Math.round((payout.amount * bps * step) / (10_000 * steps)), payout.currency);
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

  async listSlots(payout: Money, months: number, signal?: AbortSignal): Promise<Slot[]> {
    await simulateLatency(this.latencyMs, signal);
    const { takenPositions = [], startsOn = nextMonth() } = this.options;
    const fastest = Math.floor(months * FASTEST_SHARE);
    const highest = Math.floor(months * HIGHEST_SHARE);
    const zero = Money.of(0, payout.currency);

    return Array.from({ length: months }, (_, index) => {
      const position = index + 1;
      let type: SlotType = 'lowestFees';
      if (position <= fastest) type = 'fastestPayout';
      else if (position > months - highest) type = 'highestReturn';
      return Slot.create({
        position,
        payoutPeriod: addMonths(startsOn, index),
        type,
        fee:
          type === 'fastestPayout'
            ? share(payout, MAX_FEE_BPS, fastest - position + 1, fastest)
            : zero,
        discount:
          type === 'highestReturn'
            ? share(payout, MAX_DISCOUNT_BPS, position - (months - highest), highest)
            : zero,
        available: !takenPositions.includes(position),
        circleId: this.options.circleId ?? null,
      });
    });
  }

  /** Simula que otro usuario ocupó un slot (para probar la revalidación). */
  take(position: number): void {
    this.options.takenPositions = [...(this.options.takenPositions ?? []), position];
  }
}
