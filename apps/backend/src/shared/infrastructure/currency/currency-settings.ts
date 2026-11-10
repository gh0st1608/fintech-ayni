import { type CurrencySettings } from '../../application/ports/currencies.port';
import { ExchangeRates } from '../../domain/value-objects/exchange-rates';

/**
 * Monedas desde la configuración. Falla si una moneda admitida no tiene tipo de cambio: la
 * validación del entorno la llama al arrancar, así que la API no inicia con datos incoherentes.
 */
export function currencySettingsFrom(env: {
  DEFAULT_CURRENCY: string;
  SUPPORTED_CURRENCIES: readonly string[];
  EXCHANGE_RATES: readonly string[];
}): CurrencySettings {
  const official = env.DEFAULT_CURRENCY;
  const rates = ExchangeRates.parse(official, env.EXCHANGE_RATES);
  const listed = env.SUPPORTED_CURRENCIES.length > 0 ? env.SUPPORTED_CURRENCIES : [official];
  if (!listed.includes(official)) {
    throw new Error(`SUPPORTED_CURRENCIES debe incluir la moneda oficial (${official})`);
  }
  const missing = listed.filter((currency) => !rates.supports(currency));
  if (missing.length > 0) {
    throw new Error(`Falta el tipo de cambio de ${missing.join(', ')} en EXCHANGE_RATES`);
  }
  const supported = [official, ...listed.filter((currency) => currency !== official)];
  return { official, supported, rates };
}
