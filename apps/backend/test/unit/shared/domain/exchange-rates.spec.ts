import { ExchangeRates } from '@src/shared/domain/value-objects/exchange-rates';
import { Money } from '@src/shared/domain/value-objects/money';

const rates = ExchangeRates.parse('PEN', ['USD:3.75', 'EUR:4.1']);
const pen = (amount: number) => Money.of(amount, 'PEN');
const usd = (amount: number) => Money.of(amount, 'USD');

describe('ExchangeRates (pending-scope M2 y M6)', () => {
  it('convierte de USD a la moneda oficial y de vuelta, en unidades menores', () => {
    expect(rates.convert(usd(100_00), 'PEN')).toEqual(pen(375_00));
    expect(rates.convert(pen(375_00), 'USD')).toEqual(usd(100_00));
  });

  it('redondea según se pida: hacia abajo, al más cercano o hacia arriba', () => {
    // S/ 1,00 = USD 0,2666…
    expect(rates.convert(pen(100), 'USD', 'down')).toEqual(usd(26));
    expect(rates.convert(pen(100), 'USD', 'nearest')).toEqual(usd(27));
    expect(rates.convert(pen(100), 'USD', 'up')).toEqual(usd(27));
    expect(rates.convert(pen(-100), 'USD', 'down')).toEqual(usd(-26));
  });

  it('convierte entre dos monedas que no son la oficial pasando por ella', () => {
    // USD 41,00 = S/ 153,75 = EUR 37,50
    expect(rates.convert(usd(41_00), 'EUR')).toEqual(Money.of(37_50, 'EUR'));
  });

  it('devuelve el mismo monto en la misma moneda', () => {
    const amount = usd(5);
    expect(rates.convert(amount, 'USD')).toBe(amount);
  });

  it('expone la tasa como texto decimal, sin ceros de más', () => {
    expect(rates.rateOf('USD')).toBe('3.75');
    expect(rates.rateOf('EUR')).toBe('4.1');
    expect(rates.rateOf('PEN')).toBe('1');
    expect(rates.supports('USD')).toBe(true);
    expect(rates.supports('BRL')).toBe(false);
  });

  it('rechaza una moneda sin tipo de cambio', () => {
    expect(() => rates.convert(usd(1), 'BRL')).toThrow(/No hay tipo de cambio para BRL/);
  });

  it.each([
    [['USD:0'], /debe ser positiva/],
    [['USD:3,75'], /no es válida/],
    [['USD:3.75', 'USD:3.80'], /más de una tasa/],
    [['PEN:1'], /moneda oficial/],
    [['usd:3.75'], /ISO 4217/],
    [['JPY:0.025'], /decimales/],
    [['USD:3.75:1'], /Entrada inválida/],
  ])('rechaza la configuración %j', (entries, message) => {
    expect(() => ExchangeRates.parse('PEN', entries)).toThrow(message);
  });
});
