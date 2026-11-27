import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { Cadence } from '@/domain/circles/MyCircleDetail';
import type { RecommendedCircle } from '@/domain/circles/RecommendedCircle';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import {
  Slot,
  type SlotRestriction,
  type SlotsQuote,
  type SlotType,
} from '@/domain/circles/value-objects/Slot';
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
  /** Recomendados; por defecto ninguno, como el backend sin círculos abiertos. */
  recommended?: RecommendedCircle[];
  /** Tipos de turno que la regla de confianza no permite (COPAYNI-60); por defecto, ninguno. */
  notAllowed?: Partial<Record<SlotType, SlotRestriction>>;
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
/** Cómo se nombra y cuánto dura un turno de cada cadencia, para el modo dev. */
const TURN_UNIT: Record<Cadence, string> = {
  monthly: 'Mes',
  biweekly: 'Quincena',
  weekly: 'Semana',
};
const TURN_DAYS: Record<Cadence, number> = { monthly: 30, biweekly: 14, weekly: 7 };

/** `YYYY-MM-DD` más `days` días. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class InMemoryCircleQuoteRepository implements CircleQuoteRepositoryPort {
  private readonly latencyMs: number;

  constructor(private readonly options: InMemoryCircleQuoteOptions = {}) {
    this.latencyMs = options.latencyMs ?? 400;
  }

  async listInstallmentOptions(
    payout: Money,
    cadence: Cadence = 'monthly',
    signal?: AbortSignal,
  ): Promise<InstallmentOption[]> {
    await simulateLatency(this.latencyMs, signal);
    const { durations = [6, 10, 12], monthlyPayInLimit } = this.options;
    const limit =
      monthlyPayInLimit === undefined
        ? undefined
        : Money.fromMajor(monthlyPayInLimit, payout.currency);

    return durations
      .filter((turns) => payout.amount % turns === 0)
      .map((turns) => {
        const installment = Money.of(payout.amount / turns, payout.currency);
        return InstallmentOption.create({
          turns,
          installment,
          withinMonthlyLimit: !limit || installment.amount <= limit.amount,
          cadence,
          unit: TURN_UNIT[cadence],
          approximateDays: turns * TURN_DAYS[cadence],
        });
      });
  }

  async listSlots({
    payout,
    turns: months,
    cadence = 'monthly',
    signal,
  }: {
    payout: Money;
    turns: number;
    cadence?: Cadence;
    signal?: AbortSignal;
    circleId?: string | null;
  }): Promise<SlotsQuote> {
    await simulateLatency(this.latencyMs, signal);
    const { takenPositions = [], startsOn = nextMonth() } = this.options;
    const fastest = Math.floor(months * FASTEST_SHARE);
    const highest = Math.floor(months * HIGHEST_SHARE);
    const zero = Money.of(0, payout.currency);

    const slots = Array.from({ length: months }, (_, index) => {
      const position = index + 1;
      let type: SlotType = 'lowestFees';
      if (position <= fastest) type = 'fastestPayout';
      else if (position > months - highest) type = 'highestReturn';
      // En mensual, el turno cae en su mes; en las demás, cada N días desde el arranque.
      const payoutOn =
        cadence === 'monthly'
          ? `${addMonths(startsOn, index)}-01`
          : addDays(`${startsOn}-01`, index * TURN_DAYS[cadence]);
      return Slot.create({
        position,
        payoutPeriod: payoutOn.slice(0, 7),
        payoutOn,
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
        notAllowedReason: this.options.notAllowed?.[type] ?? null,
      });
    });
    // El falso arma juntas que arrancan el día 1 y avanza por días en las demás cadencias, lo
    // justo para que las pantallas muestren fechas coherentes en desarrollo.
    const first = `${startsOn}-01`;
    const durationDays = months * TURN_DAYS[cadence];
    const endsOnDate =
      cadence === 'monthly'
        ? `${addMonths(startsOn, months - 1)}-01`
        : addDays(first, (months - 1) * TURN_DAYS[cadence]);
    return {
      circleId: this.options.circleId ?? null,
      cadence,
      unit: TURN_UNIT[cadence],
      turns: months,
      startsOnDate: first,
      endsOnDate,
      durationDays,
      slots,
    };
  }

  async listRecommended(signal?: AbortSignal): Promise<RecommendedCircle[]> {
    await simulateLatency(this.latencyMs, signal);
    return [...(this.options.recommended ?? [])];
  }

  /** Simula que otro usuario ocupó un slot (para probar la revalidación). */
  take(position: number): void {
    this.options.takenPositions = [...(this.options.takenPositions ?? []), position];
  }
}
