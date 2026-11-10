import type { Money } from '@/domain/shared/value-objects/Money';

import type { PayoutRange } from './value-objects/PayoutRange';

/** Una moneda en la que se puede abrir un Game'ya (pending-scope M2). */
export interface CurrencyOption {
  /** Código ISO 4217. */
  code: string;
  /** La moneda oficial de operación. */
  official: boolean;
  /** Tipo de cambio fijo: unidades de la moneda oficial por unidad de esta (`"3.75"`). */
  rateToOfficial: string;
}

/** Configuración del backend para unirse a un círculo (GET /circles/join-config). */
export interface JoinConfig {
  /** Rango general de payout del Game'ya. */
  payoutRange: PayoutRange;
  /** Máximo de payout según el límite mensual del usuario; ausente si no lo restringe. */
  userPayoutLimit?: Money;
  /** Máximo que se puede ahorrar en el programa de ahorro. */
  savingProgramMax: Money;
  /** Monedas habilitadas; la oficial va primero. Con una sola, no hay nada que elegir. */
  currencies: readonly CurrencyOption[];
}

/** Rango que el usuario puede elegir de verdad: null si su límite no alcanza el mínimo. */
export function availablePayoutRange(config: JoinConfig): PayoutRange | null {
  return config.userPayoutLimit
    ? config.payoutRange.capTo(config.userPayoutLimit)
    : config.payoutRange;
}
