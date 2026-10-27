import type { JoinConfig } from '@/domain/circles/JoinConfig';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';
import { PayoutRange } from '@/domain/circles/value-objects/PayoutRange';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryJoinConfigOptions {
  latencyMs?: number;
  /** Límite de payout del usuario en unidades mayores; sin él no se restringe. */
  userPayoutLimit?: number;
}

/**
 * Configuración falsa (contract-first) con los valores provisionales del Figma: payout de
 * 3.000 a 120.000 en saltos de 500 y ahorro de hasta 1.000.000 (pending-scope M6).
 */
export class InMemoryJoinConfigRepository implements JoinConfigRepositoryPort {
  private readonly latencyMs: number;

  constructor(
    private readonly currency: string,
    private readonly options: InMemoryJoinConfigOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 400;
  }

  async get(signal?: AbortSignal): Promise<JoinConfig> {
    await simulateLatency(this.latencyMs, signal);
    const money = (major: number) => Money.fromMajor(major, this.currency);
    const { userPayoutLimit } = this.options;
    return {
      payoutRange: PayoutRange.create({ min: money(3000), max: money(120000), step: money(500) }),
      userPayoutLimit: userPayoutLimit === undefined ? undefined : money(userPayoutLimit),
      savingProgramMax: money(1000000),
    };
  }
}
