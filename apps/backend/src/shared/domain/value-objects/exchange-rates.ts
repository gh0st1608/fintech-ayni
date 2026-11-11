import { DomainError } from '../../errors/app-error';
import { Money } from './money';

export class InvalidExchangeRatesError extends DomainError {
  constructor(message: string) {
    super('INVALID_EXCHANGE_RATES', message);
  }
}

/** Cómo se redondea una conversión a la unidad menor. */
export type Rounding = 'down' | 'nearest' | 'up';

const CURRENCY_CODE = /^[A-Z]{3}$/;
const RATE = /^(\d{1,9})(?:\.(\d{1,6}))?$/;
/** Las tasas se guardan como enteros con 6 decimales: sin coma flotante. */
const DECIMALS = 6;
const SCALE = 10n ** BigInt(DECIMALS);

const fractionDigits = (currency: string): number =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

/** `numerator / denominator` (denominador positivo) redondeado según `rounding`. */
function divide(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  let result = quotient;
  if (remainder > 0n) {
    if (rounding === 'up') result += 1n;
    if (rounding === 'nearest' && remainder * 2n >= denominator) result += 1n;
  }
  return negative ? -result : result;
}

/**
 * Tipos de cambio fijos que actualiza el equipo (pending-scope M2 y M6): cuántas unidades de la
 * moneda oficial (`base`) vale una unidad de cada otra moneda. Convertir entre dos monedas que no
 * son la oficial pasa por ella.
 *
 * Todas las monedas deben tener los mismos decimales que la oficial (PEN y USD tienen 2): así la
 * tasa se aplica directo a las unidades menores.
 */
export class ExchangeRates {
  private constructor(
    readonly base: string,
    private readonly scaled: ReadonlyMap<string, bigint>,
  ) {}

  /** `entries` como `USD:3.75`, el formato de `EXCHANGE_RATES`. */
  static parse(base: string, entries: readonly string[]): ExchangeRates {
    const rates: Record<string, string> = {};
    for (const entry of entries) {
      const [currency = '', rate = '', ...rest] = entry.split(':');
      if (rest.length > 0) throw new InvalidExchangeRatesError(`Entrada inválida: ${entry}`);
      if (currency in rates) {
        throw new InvalidExchangeRatesError(`${currency} tiene más de una tasa`);
      }
      rates[currency] = rate;
    }
    return ExchangeRates.create(base, rates);
  }

  static create(base: string, rates: Readonly<Record<string, string>>): ExchangeRates {
    if (!CURRENCY_CODE.test(base)) {
      throw new InvalidExchangeRatesError('La moneda oficial debe ser un código ISO 4217');
    }
    const digits = fractionDigits(base);
    const scaled = new Map<string, bigint>([[base, SCALE]]);
    for (const [currency, rate] of Object.entries(rates)) {
      if (!CURRENCY_CODE.test(currency)) {
        throw new InvalidExchangeRatesError(`${currency} no es un código ISO 4217`);
      }
      if (currency === base) {
        throw new InvalidExchangeRatesError(`${base} es la moneda oficial: no lleva tasa`);
      }
      if (fractionDigits(currency) !== digits) {
        throw new InvalidExchangeRatesError(`${currency} no tiene los decimales de ${base}`);
      }
      const match = RATE.exec(rate);
      if (!match) throw new InvalidExchangeRatesError(`La tasa de ${currency} no es válida`);
      const [, whole = '0', decimals = ''] = match;
      const value = BigInt(whole) * SCALE + BigInt(decimals.padEnd(DECIMALS, '0'));
      if (value <= 0n) {
        throw new InvalidExchangeRatesError(`La tasa de ${currency} debe ser positiva`);
      }
      scaled.set(currency, value);
    }
    return new ExchangeRates(base, scaled);
  }

  supports(currency: string): boolean {
    return this.scaled.has(currency);
  }

  /** La tasa de `currency` frente a la oficial, como texto decimal (`3.75`). */
  rateOf(currency: string): string {
    const value = this.scaledOf(currency);
    const whole = value / SCALE;
    const decimals = (value % SCALE).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
    return decimals ? `${whole}.${decimals}` : whole.toString();
  }

  /** `money` en `currency`, redondeado a la unidad menor. */
  convert(money: Money, currency: string, rounding: Rounding = 'nearest'): Money {
    if (money.currency === currency) return money;
    const amount = divide(
      BigInt(money.amount) * this.scaledOf(money.currency),
      this.scaledOf(currency),
      rounding,
    );
    return Money.of(Number(amount), currency);
  }

  private scaledOf(currency: string): bigint {
    const value = this.scaled.get(currency);
    if (value === undefined) {
      throw new InvalidExchangeRatesError(`No hay tipo de cambio para ${currency}`);
    }
    return value;
  }
}
