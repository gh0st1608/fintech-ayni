import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number): Money => Money.of(amount, 'PEN');
const amounts = (list: Money[]): number[] => list.map(({ amount }) => amount);

describe('Money: operaciones', () => {
  it('suma, resta y multiplica en la misma moneda', () => {
    expect(pen(150).add(pen(50)).amount).toBe(200);
    expect(pen(150).subtract(pen(200)).amount).toBe(-50);
    expect(pen(2_500).times(12).amount).toBe(30_000);
    expect(Money.zero('PEN').isZero()).toBe(true);
    expect(pen(-1).isNegative()).toBe(true);
  });

  it('rechaza operar monedas distintas y factores no enteros', () => {
    const error = expect.objectContaining({ code: 'INVALID_MONEY' });
    expect(() => pen(1).add(Money.of(1, 'USD'))).toThrow(error);
    expect(() => pen(1).subtract(Money.of(1, 'USD'))).toThrow(error);
    expect(() => pen(1).times(1.5)).toThrow(error);
  });

  it('calcula porcentajes en puntos básicos redondeando al céntimo', () => {
    expect(pen(2_400_000).percentage(1_200).amount).toBe(288_000);
    // 10 % de 2.400.000 × 2/3 = 160.000
    expect(pen(2_400_000).percentage(1_000, 2, 3).amount).toBe(160_000);
    // 1 % de 150 = 1,5 → 2 (0,5 hacia arriba); 1 % de 149 = 1,49 → 1
    expect(pen(150).percentage(100).amount).toBe(2);
    expect(pen(149).percentage(100).amount).toBe(1);
    expect(pen(Number.MAX_SAFE_INTEGER).percentage(10_000).amount).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rechaza tasas o fracciones no enteras', () => {
    const error = expect.objectContaining({ code: 'INVALID_MONEY' });
    expect(() => pen(100).percentage(1.5)).toThrow(error);
    expect(() => pen(100).percentage(100, 1, 0)).toThrow(error);
    expect(() => pen(100).percentage(100, 0.5)).toThrow(error);
  });

  it('reparte en partes que suman exactamente el total, con el resto en las primeras', () => {
    expect(amounts(pen(100).allocate(3))).toEqual([34, 33, 33]);
    expect(amounts(pen(-100).allocate(3))).toEqual([-34, -33, -33]);
    expect(amounts(pen(2).allocate(4))).toEqual([1, 1, 0, 0]);
    expect(amounts(pen(0).allocate(2))).toEqual([0, 0]);
    expect(() => pen(1).allocate(0)).toThrow(expect.objectContaining({ code: 'INVALID_MONEY' }));
  });
});

describe('Period', () => {
  it('crea, interpreta y serializa meses', () => {
    expect(Period.of(2026, 3).toString()).toBe('2026-03');
    expect(Period.parse('2026-11').equals(Period.of(2026, 11))).toBe(true);
  });

  it('suma meses cruzando años, también hacia atrás', () => {
    expect(Period.of(2026, 11).addMonths(3).toString()).toBe('2027-02');
    expect(Period.of(2026, 1).addMonths(-1).toString()).toBe('2025-12');
    expect(Period.of(2026, 1).addMonths(24).toString()).toBe('2028-01');
  });

  it('cuenta los meses entre dos periodos', () => {
    expect(Period.of(2026, 11).monthsUntil(Period.of(2027, 10))).toBe(11);
    expect(Period.of(2027, 1).monthsUntil(Period.of(2026, 12))).toBe(-1);
  });

  it.each([
    ['mes 0', () => Period.of(2026, 0)],
    ['mes 13', () => Period.of(2026, 13)],
    ['año fuera de rango', () => Period.of(1999, 1)],
    ['formato inválido', () => Period.parse('2026-1')],
    ['meses no enteros', () => Period.of(2026, 1).addMonths(0.5)],
  ])('rechaza %s', (_case, create) => {
    expect(create).toThrow(expect.objectContaining({ code: 'INVALID_PERIOD', kind: 'domain' }));
  });
});
