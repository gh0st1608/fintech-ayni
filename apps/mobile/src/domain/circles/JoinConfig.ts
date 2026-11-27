import type { Cadence } from './MyCircleDetail';
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

/** Una frecuencia que se puede elegir, tal como la ofrece el servidor. */
export interface CadenceOption {
  id: Cadence;
  /** Cómo se llama un turno: «Mes», «Quincena», «Semana». */
  unit: string;
  /** Días que dura un turno; aproximado en la mensual. */
  turnDays: number;
  /** true en la mensual, la de todas las juntas que existen. */
  default: boolean;
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
  /**
   * Frecuencias que se pueden elegir (COPAYNI-116): las que el servidor habilita y la app
   * declara soportar. Con una sola no hay paso de frecuencia, y el flujo es el mensual de hoy.
   */
  cadences: readonly CadenceOption[];
  /** Versión vigente de los términos del círculo: se acepta y se envía al unirse (COPAYNI-86). */
  termsVersion: string;
}

/** Si hay frecuencia que elegir: con una sola, el paso no se muestra (COPAYNI-116). */
export function offersCadenceChoice(config: JoinConfig): boolean {
  return config.cadences.length > 1;
}

/** Rango que el usuario puede elegir de verdad: null si su límite no alcanza el mínimo. */
export function availablePayoutRange(config: JoinConfig): PayoutRange | null {
  return config.userPayoutLimit
    ? config.payoutRange.capTo(config.userPayoutLimit)
    : config.payoutRange;
}
