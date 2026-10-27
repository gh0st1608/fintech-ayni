import type { Money } from '@/domain/shared/value-objects/Money';

import type { PayoutRange } from './value-objects/PayoutRange';

/** Configuración del backend para unirse a un círculo (GET /circles/join-config). */
export interface JoinConfig {
  /** Rango general de payout del Game'ya. */
  payoutRange: PayoutRange;
  /** Máximo de payout según el límite mensual del usuario; ausente si no lo restringe. */
  userPayoutLimit?: Money;
  /** Máximo que se puede ahorrar en el programa de ahorro. */
  savingProgramMax: Money;
}

/** Rango que el usuario puede elegir de verdad: null si su límite no alcanza el mínimo. */
export function availablePayoutRange(config: JoinConfig): PayoutRange | null {
  return config.userPayoutLimit
    ? config.payoutRange.capTo(config.userPayoutLimit)
    : config.payoutRange;
}
