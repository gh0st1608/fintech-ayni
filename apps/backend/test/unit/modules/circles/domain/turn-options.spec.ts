import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import {
  installmentOptions,
  nearestOffers,
  offerableAmounts,
} from '@src/modules/circles/domain/services/installment-options';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import {
  MAX_CIRCLE_TURNS,
  TurnOptions,
} from '@src/modules/circles/domain/value-objects/turn-options';
import { ExchangeRates } from '@src/shared/domain/value-objects/exchange-rates';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

/**
 * Turnos configurables por rango (COPAYNI-125).
 *
 * El producto ofrecía tres duraciones fijas, `6,10,12`, heredadas de cuando un turno era siempre
 * un mes. Al admitir cadencias, el número de turnos deja de ser una duración: 12 turnos son 12
 * meses en mensual y unas 12 semanas en semanal, y limitar a tres valores deja fuera juntas
 * cortas que en semanal son lo razonable.
 *
 * Dos cosas tienen que convivir y las dos se prueban aquí:
 *
 * - El rango, que es la capacidad nueva.
 * - La lista cerrada, porque **ningún rango reproduce exactamente `6,10,12`**: activar el rango
 *   cambia lo que se le ofrece a la gente, y eso lo decide negocio, no un despliegue de código.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');

/** El rango y el salto de producción: 235 montos, de S/ 3.000 a S/ 120.000 de 500 en 500. */
const RANGE = PayoutRange.create({
  min: pen(300_000),
  max: pen(12_000_000),
  step: pen(50_000),
});

const ALL_AMOUNTS = Array.from(
  { length: (RANGE.max.amount - RANGE.min.amount) / RANGE.step.amount + 1 },
  (_unused, index) => RANGE.min.amount + index * RANGE.step.amount,
);

/** La configuración de producción hoy. */
const TODAY = [6, 10, 12];

describe('TurnOptions (COPAYNI-125)', () => {
  it('la lista cerrada se ordena y deduplica, como la configuración de siempre', () => {
    expect(TurnOptions.list([12, 6, 10, 6]).candidates).toEqual([6, 10, 12]);
  });

  it('el rango incluye los dos extremos', () => {
    expect(TurnOptions.range(2, 5).candidates).toEqual([2, 3, 4, 5]);
    expect(TurnOptions.range(4, 4).candidates).toEqual([4]);
    expect(TurnOptions.range(2, MAX_CIRCLE_TURNS).candidates).toHaveLength(MAX_CIRCLE_TURNS - 1);
  });

  it.each([
    ['sin duraciones', () => TurnOptions.list([])],
    ['con una duración de un turno', () => TurnOptions.list([1, 6])],
    ['con una duración no entera', () => TurnOptions.list([6.5])],
    ['con una duración sobre el tope', () => TurnOptions.list([MAX_CIRCLE_TURNS + 1])],
    ['con un mínimo de un turno', () => TurnOptions.range(1, 12)],
    ['con un máximo sobre el tope', () => TurnOptions.range(2, MAX_CIRCLE_TURNS + 1)],
    ['con el máximo bajo el mínimo', () => TurnOptions.range(12, 6)],
    ['con un rango no entero', () => TurnOptions.range(2.5, 12)],
  ])('no se construye %s', (_case, build) => {
    expect(build).toThrow(expect.objectContaining({ code: 'INVALID_TURN_OPTIONS' }));
  });

  it('`from` descarta lo inadmisible en lugar de fallar, y admite quedarse sin nada', () => {
    // Es la vía de quien recibe números sin validar; la configuración entra por `list`.
    expect(TurnOptions.from([1, 6, 6.5, 99, 10]).candidates).toEqual([6, 10]);
    expect(TurnOptions.from([1]).candidates).toEqual([]);
  });
});

describe('Opciones de cuota con la configuración de hoy (COPAYNI-125)', () => {
  it('ofrece exactamente lo mismo que antes del cambio, en los 235 montos del rango', () => {
    // La prueba de equivalencia del ticket. La regla anterior era la divisibilidad exacta sobre
    // la lista configurada, y eso es lo que tiene que seguir saliendo, monto por monto.
    for (const amount of ALL_AMOUNTS) {
      const payout = pen(amount);
      const expected = TODAY.filter((turns) => amount % turns === 0);

      const options = installmentOptions(payout, TurnOptions.list(TODAY));
      expect(options.map(({ turns }) => turns)).toEqual(expected);
      expect(options.map(({ installment }) => installment.amount)).toEqual(
        expected.map((turns) => amount / turns),
      );
      // Y la lista cruda da el mismo resultado que el objeto de valor: ninguno de los dos
      // caminos cambia lo que ya se ofrecía.
      expect(installmentOptions(payout, TODAY)).toEqual(options);
    }
  });

  it('sigue exponiendo `months` con el mismo valor que `turns`', () => {
    // La app publicada lee `months`; quitarlo la rompe (COPAYNI-122).
    const options = installmentOptions(pen(3_000_000), TurnOptions.list(TODAY));
    expect(options.map(({ months }) => months)).toEqual([6, 10, 12]);
    expect(options.every(({ months, turns }) => months === turns)).toBe(true);
  });

  it('ningún monto del rango de producción se queda sin opciones', () => {
    // Todo monto del rango es múltiplo de 50.000 y por tanto de 10: hoy la rama del monto sin
    // duraciones no se alcanza con esta configuración, y por eso es defensiva.
    const sinOpciones = ALL_AMOUNTS.filter(
      (amount) => installmentOptions(pen(amount), TurnOptions.list(TODAY)).length === 0,
    );
    expect(sinOpciones).toEqual([]);
  });
});

describe('Opciones de cuota con el rango (COPAYNI-125)', () => {
  it('ofrece solo las combinaciones que existen, no las 11 del rango', () => {
    // 12.000 en el rango completo de 2 a 12 (COPAYNI-101): salen 8 duraciones, no 11. Es el punto
    // del ticket: el usuario elige dentro de lo que se puede construir, no dentro de lo
    // configurado.
    const options = installmentOptions(pen(1_200_000), TurnOptions.range(2, MAX_CIRCLE_TURNS));

    expect(options.map(({ turns }) => turns)).toEqual([2, 3, 4, 5, 6, 8, 10, 12]);
    expect(
      options.every(({ installment, turns }) => installment.amount * turns === 1_200_000),
    ).toBe(true);
  });

  it('el rango no pierde las duraciones de la lista de hoy', () => {
    // Un rango que las contiene ofrece esas tres y además las otras que existan.
    const amount = pen(3_000_000);
    const wide = installmentOptions(amount, TurnOptions.range(2, MAX_CIRCLE_TURNS)).map(
      ({ turns }) => turns,
    );

    for (const turns of TODAY) expect(wide).toContain(turns);
  });

  it('expresa la duración en la unidad de su cadencia', () => {
    const [weekly] = installmentOptions(pen(1_200_000), [12], Cadence.weekly);
    const [biweekly] = installmentOptions(pen(1_200_000), [12], Cadence.biweekly);
    const [monthly] = installmentOptions(pen(1_200_000), [12]);

    // Misma cuota y mismos puestos; duración distinta, que es justo lo que había que derivar.
    expect([weekly, biweekly, monthly].map((option) => option?.installment.amount)).toEqual([
      100_000, 100_000, 100_000,
    ]);
    expect(weekly).toMatchObject({ cadence: 'weekly', unit: 'Semana', approximateDays: 84 });
    expect(biweekly).toMatchObject({ cadence: 'biweekly', unit: 'Quincena', approximateDays: 168 });
    expect(monthly).toMatchObject({ cadence: 'monthly', unit: 'Mes', approximateDays: 360 });
  });

  it('la cadencia no cambia qué duraciones existen, solo cuánto duran', () => {
    // La cuota exacta reparte un monto en partes iguales: es aritmética del monto, no del tiempo.
    const turnsOf = (cadence: Cadence) =>
      installmentOptions(pen(1_250_000), TurnOptions.range(2, MAX_CIRCLE_TURNS), cadence).map(
        ({ turns }) => turns,
      );

    expect(turnsOf(Cadence.weekly)).toEqual(turnsOf(Cadence.monthly));
    expect(turnsOf(Cadence.biweekly)).toEqual(turnsOf(Cadence.monthly));
  });
});

describe('Toda combinación ofrecida es construible (COPAYNI-125)', () => {
  /** El arranque de cada cadencia: la mensual empieza el día 1 del mes (COPAYNI-108). */
  const startOf = (cadence: Cadence) =>
    cadence.isMonthly() ? Period.of(2027, 1) : LocalDate.parse('2027-01-04');

  it.each(Cadence.all().map((cadence) => [cadence.id, cadence] as const))(
    'en cadencia %s, el catálogo completo con el rango más amplio no falla por divisibilidad',
    (_id, cadence) => {
      const wide = TurnOptions.range(2, MAX_CIRCLE_TURNS);
      let built = 0;

      for (const amount of ALL_AMOUNTS) {
        for (const { turns, installment } of installmentOptions(pen(amount), wide, cadence)) {
          const terms = CircleTerms.create({
            payout: pen(amount),
            turns,
            cadence,
            startsOn: startOf(cadence),
          });
          // La cuota que se ofreció es la que termina teniendo el círculo, al céntimo.
          expect(terms.baseInstallment).toEqual(installment);
          expect(terms.baseInstallment.times(turns)).toEqual(terms.payout);
          built += 1;
        }
      }
      // Que no pase de largo sin construir nada: con el rango de 2 a 12 (COPAYNI-101) son 1.493
      // combinaciones por cadencia.
      expect(built).toBeGreaterThan(1_400);
    },
  );

  it('el rango más amplio no degrada el cálculo de opciones', () => {
    // Es lineal en el tamaño del rango: 23 comprobaciones de divisibilidad por monto. El umbral
    // es holgado a propósito —no mide la máquina, descarta un coste accidental.
    const wide = TurnOptions.range(2, MAX_CIRCLE_TURNS);
    const started = performance.now();

    for (const amount of ALL_AMOUNTS) installmentOptions(pen(amount), wide);

    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('Montos ofrecibles para una duración (COPAYNI-125)', () => {
  it('es la operación simétrica: quien fija los turnos sabe qué montos puede pedir', () => {
    // Con 7 turnos solo sirven los múltiplos de 350.000 del rango: 50.000 × 7.
    const amounts = offerableAmounts(RANGE, 7).map(({ amount }) => amount);

    expect(amounts.slice(0, 3)).toEqual([350_000, 700_000, 1_050_000]);
    expect(amounts.every((amount) => amount % 7 === 0)).toBe(true);
    // Y es exactamente el complemento de lo que ofrece la otra dirección, monto por monto.
    for (const amount of ALL_AMOUNTS) {
      const offered = installmentOptions(pen(amount), [7]).length > 0;
      expect(amounts.includes(amount)).toBe(offered);
    }
  });

  it('todo monto ofrecible cae en un salto del slider y dentro del rango', () => {
    for (const money of offerableAmounts(RANGE, 9)) expect(RANGE.contains(money)).toBe(true);
  });

  it('sin duración válida no ofrece montos', () => {
    expect(offerableAmounts(RANGE, 0)).toEqual([]);
    expect(offerableAmounts(RANGE, 2.5)).toEqual([]);
  });
});

describe('Monto sin ninguna duración exacta (COPAYNI-125)', () => {
  // Una configuración de 7 o 9 turnos: es la del diseño aprobado en COPAYNI-116, donde 12.000
  // no se reparte exacto y la interfaz tiene que decir con qué monto sí.
  const SEVEN_OR_NINE = TurnOptions.list([7, 9]);

  it('no se responde con una lista vacía sin motivo, sino con los montos cercanos', () => {
    expect(installmentOptions(pen(1_200_000), SEVEN_OR_NINE)).toEqual([]);

    const offers = nearestOffers(pen(1_200_000), RANGE, SEVEN_OR_NINE);

    // El anterior y el siguiente del slider que sí existen, con la combinación de cada uno.
    expect(offers.map(({ payout }) => payout.amount)).toEqual([1_050_000, 1_350_000]);
    expect(offers[0]?.options).toEqual([
      expect.objectContaining({ turns: 7, installment: pen(150_000) }),
    ]);
    expect(offers[1]?.options).toEqual([
      expect.objectContaining({ turns: 9, installment: pen(150_000) }),
    ]);
  });

  it('los montos propuestos son montos que el usuario puede elegir', () => {
    for (const { payout, options } of nearestOffers(pen(1_200_000), RANGE, SEVEN_OR_NINE)) {
      expect(RANGE.contains(payout)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
    }
  });

  it('propone solo por un lado cuando el otro se sale del rango', () => {
    // El mínimo del rango con una configuración que no lo admite: solo hay montos por encima.
    const atMin = nearestOffers(RANGE.min, RANGE, SEVEN_OR_NINE);
    expect(atMin.map(({ payout }) => payout.amount)).toEqual([350_000]);
  });

  it('no propone nada si ningún monto del rango admite ninguna duración', () => {
    const narrow = PayoutRange.create({ min: pen(100), max: pen(300), step: pen(100) });
    expect(nearestOffers(pen(200), narrow, TurnOptions.list([7]))).toEqual([]);
  });
});

describe('JoinConfig con rango de turnos (COPAYNI-125)', () => {
  const base = {
    payoutRange: RANGE,
    savingProgramMax: pen(100_000_000),
    userPayoutLimit: null,
  };

  it('acepta el rango y expone sus duraciones', () => {
    const config = JoinConfig.create({ ...base, turnRange: { min: 2, max: 6 } });

    expect(config.turnOptions.candidates).toEqual([2, 3, 4, 5, 6]);
    // `durationOptions` sigue respondiendo lo mismo: es lo que leen el contrato y los recomendados.
    expect(config.durationOptions).toEqual([2, 3, 4, 5, 6]);
  });

  it('exige una sola forma de dar las duraciones', () => {
    expect(() =>
      JoinConfig.create({ ...base, durationOptions: TODAY, turnRange: { min: 2, max: 6 } }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_JOIN_CONFIG' }));
    expect(() => JoinConfig.create(base)).toThrow(
      expect.objectContaining({ code: 'INVALID_JOIN_CONFIG' }),
    );
  });

  it('reexpresa un rango inválido como error de la configuración de unión', () => {
    // Quien configura ve el error de la configuración, no el del objeto de valor interno.
    expect(() => JoinConfig.create({ ...base, turnRange: { min: 12, max: 6 } })).toThrow(
      expect.objectContaining({ code: 'INVALID_JOIN_CONFIG' }),
    );
  });

  it('conserva las duraciones al convertir de moneda', () => {
    const rates = ExchangeRates.parse('PEN', ['USD:3.75']);
    const config = JoinConfig.create({ ...base, turnRange: { min: 2, max: 6 } });

    expect(config.convertedTo('USD', rates).turnOptions.candidates).toEqual([2, 3, 4, 5, 6]);
  });
});
