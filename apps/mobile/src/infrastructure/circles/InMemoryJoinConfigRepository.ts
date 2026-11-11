import type { JoinConfig } from '@/domain/circles/JoinConfig';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';
import { PayoutRange } from '@/domain/circles/value-objects/PayoutRange';
import { Money } from '@/domain/shared/value-objects/Money';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryJoinConfigOptions {
  latencyMs?: number;
  /** Límite de payout del usuario en unidades mayores; sin él no se restringe. */
  userPayoutLimit?: number;
  /**
   * Otra moneda habilitada con su tipo de cambio fijo (pending-scope M2), p. ej. dólares a
   * `"3.75"`. Sus montos son los equivalentes que calcula el backend.
   */
  secondCurrency?: { code: string; rateToOfficial: string };
}

/**
 * Configuración falsa (contract-first) con los valores provisionales del Figma: payout de
 * 3.000 a 120.000 en saltos de 500 y ahorro de hasta 1.000.000 (pending-scope M6). En la segunda
 * moneda, los equivalentes a 3,75: de 800 a 32.000 en saltos de 100 y ahorro de hasta 266.666.
 */
export class InMemoryJoinConfigRepository implements JoinConfigRepositoryPort {
  private readonly latencyMs: number;

  constructor(
    private readonly currency: string,
    private readonly options: InMemoryJoinConfigOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 400;
  }

  async get(signal?: AbortSignal, currency: string = this.currency): Promise<JoinConfig> {
    await simulateLatency(this.latencyMs, signal);
    const second = this.options.secondCurrency;
    const currencies = [
      { code: this.currency, official: true, rateToOfficial: '1' },
      ...(second ? [{ ...second, official: false }] : []),
    ];
    if (!currencies.some(({ code }) => code === currency)) {
      throw new AppError('validation', 'Currency not supported', {
        status: 400,
        fieldErrors: { currency: 'not_supported' },
      });
    }
    const money = (major: number) => Money.fromMajor(major, currency);
    const official = currency === this.currency;
    const { userPayoutLimit } = this.options;
    return {
      payoutRange: official
        ? PayoutRange.create({ min: money(3000), max: money(120000), step: money(500) })
        : PayoutRange.create({ min: money(800), max: money(32000), step: money(100) }),
      userPayoutLimit: userPayoutLimit === undefined ? undefined : money(userPayoutLimit),
      savingProgramMax: money(official ? 1000000 : 266666),
      currencies,
      termsVersion: '2026-11',
    };
  }
}
