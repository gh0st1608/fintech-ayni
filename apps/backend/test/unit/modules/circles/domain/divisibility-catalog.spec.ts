import { installmentOptions } from '@src/modules/circles/domain/services/installment-options';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';

/**
 * La regla de cuota exacta sobre el catálogo completo (COPAYNI-113).
 *
 * El payout se reparte en cuotas exactas, sin repartir redondeos entre miembros, así que un
 * número de turnos solo se puede ofrecer si divide el monto. Esta prueba fija el hecho aritmético
 * que midió el ticket, porque es lo que decide qué se puede ofrecer y de ahí cuelga COPAYNI-125:
 * **la divisibilidad no se degrada poco a poco, se cae de golpe según los factores del número**.
 *
 * La rejilla de montos es múltiplo de 50.000 = 2⁴ × 5⁵: los números de turno hechos solo de 2 y 5
 * la dividen siempre, y cualquier factor 3, 7, 11 o 13 la rompe. Si alguien cambia la rejilla o el
 * rango, estos números cambian y conviene verlo aquí antes que en la oferta al usuario.
 */
const CATALOG_MIN = 300_000;
const CATALOG_MAX = 12_000_000;
const CATALOG_STEP = 50_000;

const CATALOG = Array.from(
  { length: (CATALOG_MAX - CATALOG_MIN) / CATALOG_STEP + 1 },
  (_unused, index) => Money.of(CATALOG_MIN + index * CATALOG_STEP, 'PEN'),
);

const offerable = (turns: number): number =>
  CATALOG.filter((payout) => CircleTerms.divides(payout, turns)).length;

describe('Cuota exacta sobre el catálogo (COPAYNI-113)', () => {
  it('el catálogo de prd son 235 montos, de 3.000 a 120.000 cada 500', () => {
    expect(CATALOG).toHaveLength(235);
  });

  it.each([
    [2, 235],
    [4, 235],
    [5, 235],
    [8, 235],
    [10, 235],
    [16, 235],
  ])('con %i turnos se puede ofrecer cualquier monto (%i de 235)', (turns, expected) => {
    expect(offerable(turns)).toBe(expected);
  });

  it.each([
    [3, 79],
    [6, 79],
    [12, 79],
    [15, 79],
    [7, 34],
    [14, 34],
    [9, 26],
    [11, 21],
    [13, 18],
  ])('con %i turnos solo %i de los 235 montos dan cuota exacta', (turns, expected) => {
    expect(offerable(turns)).toBe(expected);
  });

  it('las duraciones ofrecidas hoy son las que dividen el monto, y nada más', () => {
    // 30.000 se reparte en 6, 10 y 12; 30.500 en ninguna de las tres, y no se ofrece.
    expect(installmentOptions(Money.of(3_000_000, 'PEN'), [6, 10, 12])).toEqual([
      { months: 6, installment: Money.of(500_000, 'PEN') },
      { months: 10, installment: Money.of(300_000, 'PEN') },
      { months: 12, installment: Money.of(250_000, 'PEN') },
    ]);
    expect(installmentOptions(Money.of(3_050_000, 'PEN'), [6, 10, 12])).toEqual([
      { months: 10, installment: Money.of(305_000, 'PEN') },
    ]);
  });

  it('un turno de menos del mínimo no se ofrece aunque divida', () => {
    // 1 divide cualquier monto, y una junta de un turno no es una junta.
    expect(CircleTerms.divides(Money.of(3_000_000, 'PEN'), 1)).toBe(true);
    expect(installmentOptions(Money.of(3_000_000, 'PEN'), [1, 10])).toEqual([
      { months: 10, installment: Money.of(300_000, 'PEN') },
    ]);
  });
});
