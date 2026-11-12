import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import type { PayoutAccount } from '@/domain/payouts/value-objects/PayoutAccount';
import {
  PayoutMethod,
  type PayoutMethods,
  type PayoutMethodType,
} from '@/domain/payouts/value-objects/PayoutMethod';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryPayoutMethodOptions {
  latencyMs?: number;
  selected?: PayoutMethodType | null;
  /** Simula el mes de payout: cualquier cambio de método se rechaza. */
  changeLocked?: boolean;
  /** Cuenta de cobro registrada por el equipo (COPAYNI-81); sin valor, no hay. */
  account?: PayoutAccount | null;
}

/** Mismo catálogo que el backend por defecto: los métodos de Perú (COPAYNI-95). */
const catalog = (_currency: string): PayoutMethod[] => [
  PayoutMethod.create({ type: 'bankAccount', available: true, badges: ['noCharge'] }),
  PayoutMethod.create({ type: 'wallet', available: true, badges: ['noCharge'] }),
];

/** Métodos de cobro falsos (solo dev y pruebas). */
export class InMemoryPayoutMethodRepository implements PayoutMethodRepositoryPort {
  selected: PayoutMethodType | null;
  private readonly latencyMs: number;
  private readonly changeLocked: boolean;
  payoutAccount: PayoutAccount | null;

  constructor(
    private readonly currency: string,
    options: InMemoryPayoutMethodOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 300;
    this.selected = options.selected ?? null;
    this.changeLocked = options.changeLocked ?? false;
    this.payoutAccount = options.account ?? null;
  }

  async account(signal?: AbortSignal): Promise<PayoutAccount | null> {
    await simulateLatency(this.latencyMs, signal);
    return this.payoutAccount;
  }

  async list(signal?: AbortSignal): Promise<PayoutMethods> {
    await simulateLatency(this.latencyMs, signal);
    return { methods: catalog(this.currency), selected: this.selected };
  }

  async select(type: PayoutMethodType): Promise<PayoutMethods> {
    await simulateLatency(this.latencyMs);
    if (!catalog(this.currency).some((method) => method.type === type && method.available)) {
      throw new AppError('validation', 'Not available', { code: 'PAYOUT_METHOD_NOT_AVAILABLE' });
    }
    if (this.changeLocked && this.selected !== null && this.selected !== type) {
      throw new AppError('validation', 'Locked', { code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED' });
    }
    this.selected = type;
    return { methods: catalog(this.currency), selected: type };
  }
}
