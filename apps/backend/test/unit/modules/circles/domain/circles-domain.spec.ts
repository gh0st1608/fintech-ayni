import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { Money } from '@src/shared/domain/value-objects/money';

const pen = (amount: number) => Money.of(amount, 'PEN');
const range = () =>
  PayoutRange.create({ min: pen(300_000), max: pen(12_000_000), step: pen(50_000) });

describe('Money', () => {
  it('acepta enteros en unidades menores con moneda ISO 4217', () => {
    const money = Money.of(300_000, 'USD');
    expect(money).toMatchObject({ amount: 300_000, currency: 'USD' });
    expect(money.isPositive()).toBe(true);
    expect(Money.of(0, 'USD').isPositive()).toBe(false);
  });

  it.each([
    [10.5, 'PEN', 'entero'],
    [Number.MAX_SAFE_INTEGER + 1, 'PEN', 'entero'],
    [100, 'pen', 'ISO 4217'],
    [100, 'SOLES', 'ISO 4217'],
  ])('rechaza %p %p', (amount, currency, reason) => {
    expect(() => Money.of(amount, currency)).toThrow(
      expect.objectContaining({ code: 'INVALID_MONEY', message: expect.stringContaining(reason) }),
    );
  });

  it('compara monto y moneda', () => {
    expect(pen(100).equals(pen(100))).toBe(true);
    expect(pen(100).equals(pen(200))).toBe(false);
    expect(pen(100).equals(Money.of(100, 'USD'))).toBe(false);
  });
});

describe('PayoutRange', () => {
  it('crea un rango alcanzable en saltos completos', () => {
    const payout = range();
    expect(payout.currency).toBe('PEN');
    expect(payout.max.amount).toBe(12_000_000);
  });

  it('admite un rango de un solo valor', () => {
    expect(() =>
      PayoutRange.create({ min: pen(300_000), max: pen(300_000), step: pen(50_000) }),
    ).not.toThrow();
  });

  it.each([
    ['monedas distintas', { min: pen(100), max: Money.of(200, 'USD'), step: pen(100) }],
    ['salto en otra moneda', { min: pen(100), max: pen(200), step: Money.of(100, 'USD') }],
    ['mínimo no positivo', { min: pen(0), max: pen(200), step: pen(100) }],
    ['salto no positivo', { min: pen(100), max: pen(200), step: pen(0) }],
    ['máximo menor que el mínimo', { min: pen(300), max: pen(200), step: pen(100) }],
    ['máximo inalcanzable', { min: pen(100), max: pen(250), step: pen(100) }],
  ])('rechaza %s', (_case, props) => {
    expect(() => PayoutRange.create(props)).toThrow(
      expect.objectContaining({ code: 'INVALID_PAYOUT_RANGE', kind: 'domain' }),
    );
  });
});

describe('JoinConfig', () => {
  it('crea la configuración con o sin límite del usuario', () => {
    const config = JoinConfig.create({
      payoutRange: range(),
      savingProgramMax: pen(100_000_000),
      userPayoutLimit: pen(2_000_000),
      durationOptions: [12, 6, 10, 6],
    });
    expect(config.userPayoutLimit?.amount).toBe(2_000_000);
    expect(config.durationOptions).toEqual([6, 10, 12]);
    expect(
      JoinConfig.create({
        payoutRange: range(),
        savingProgramMax: pen(100_000_000),
        userPayoutLimit: null,
        durationOptions: [12],
      }).userPayoutLimit,
    ).toBeNull();
  });

  it.each([
    ['ahorro no positivo', { savingProgramMax: pen(0), userPayoutLimit: null }],
    ['ahorro en otra moneda', { savingProgramMax: Money.of(1, 'USD'), userPayoutLimit: null }],
    ['límite en otra moneda', { savingProgramMax: pen(1), userPayoutLimit: Money.of(1, 'USD') }],
    ['límite negativo', { savingProgramMax: pen(1), userPayoutLimit: pen(-1) }],
    ['sin duraciones', { savingProgramMax: pen(1), userPayoutLimit: null, durationOptions: [] }],
    [
      'duración de 1 mes',
      { savingProgramMax: pen(1), userPayoutLimit: null, durationOptions: [1] },
    ],
    [
      'duración no entera',
      { savingProgramMax: pen(1), userPayoutLimit: null, durationOptions: [6.5] },
    ],
  ])('rechaza %s', (_case, props) => {
    expect(() =>
      JoinConfig.create({ payoutRange: range(), durationOptions: [12], ...props }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_JOIN_CONFIG' }));
  });
});
