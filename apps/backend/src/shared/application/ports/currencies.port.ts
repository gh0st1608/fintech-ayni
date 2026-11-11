import { type ExchangeRates } from '../../domain/value-objects/exchange-rates';

export const CURRENCIES = Symbol('CURRENCIES');

/** Monedas de operación (pending-scope M1, M2 y M6). */
export interface CurrencySettings {
  /** La moneda oficial (`DEFAULT_CURRENCY`): PEN. */
  readonly official: string;
  /** Monedas en las que se puede abrir un Game'ya; la oficial va primero. */
  readonly supported: readonly string[];
  /** Tipos de cambio fijos frente a la oficial. */
  readonly rates: ExchangeRates;
}
