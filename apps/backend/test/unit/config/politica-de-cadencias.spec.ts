import { validateEnvironment } from '@src/config/env.validation';
import {
  priceOf,
  retainedInstallments,
  SlotPricing,
} from '@src/modules/circles/domain/services/slot-pricing';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import {
  MAX_CIRCLE_TURNS,
  TurnOptions,
} from '@src/modules/circles/domain/value-objects/turn-options';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TEST_ENV } from '@test/setup-env';
import { TEST_PRICING_RULES } from '@test/support/join-circle.fixture';

/**
 * Las decisiones de negocio y de riesgo de las cadencias (COPAYNI-101 y COPAYNI-102).
 *
 * El código ya admitía configurar turnos, gracia, mora y retención por cadencia, pero los valores
 * eran provisionales y las dos decisiones estaban abiertas. El PO las cerró el 27 de noviembre de
 * 2026, y esta prueba fija los valores decididos y sus consecuencias: un cambio de criterio tiene
 * que pasar por aquí y verse en la revisión, no colarse al tocar un número.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');

const env = validateEnvironment(TEST_ENV);

const monthly = (turns: number) =>
  CircleTerms.create({ payout: pen(1_200_000), turns, startsOn: Period.of(2026, 11) });

const weekly = (turns: number) =>
  CircleTerms.create({
    payout: pen(1_200_000),
    turns,
    cadence: Cadence.weekly,
    startsOn: LocalDate.parse('2026-11-04'),
  });

/** La retención tal como queda configurada, y la de antes del tope, para ver qué cambia. */
const pricing = (maxPotBps: number) =>
  new SlotPricing(
    SlotPricingRules.create({
      ...TEST_PRICING_RULES.props,
      retentionCoverageDays: env.PAYOUT_RETENTION_COVERAGE_DAYS,
      retentionMaxPotBps: maxPotBps,
    }),
  );

const retained = (terms: CircleTerms, position: number, rules: SlotPricing) =>
  retainedInstallments(rules.quote(terms, position), terms.baseInstallment);

const WITH_CAP = pricing(env.PAYOUT_RETENTION_MAX_POT_BPS);
const WITHOUT_CAP = pricing(10_000);

describe('Tope de turnos de una junta (COPAYNI-101)', () => {
  it('son 12 turnos, el mismo máximo en las tres cadencias', () => {
    expect(MAX_CIRCLE_TURNS).toBe(12);
    expect(TurnOptions.range(2, 12).candidates).toHaveLength(11);
    expect(() => TurnOptions.range(2, 13)).toThrow(/El máximo de turnos es 12/);
    expect(() => TurnOptions.list([13])).toThrow(/entre 2 y 12/);
  });

  it('no cambia la lista de hoy: 6, 10 y 12 siguen dentro del tope', () => {
    expect(TurnOptions.list([6, 10, 12]).candidates).toEqual([6, 10, 12]);
  });

  it('con 12 turnos una junta semanal dura 84 días, que es lo que acota la decisión', () => {
    // El tope se eligió por el horizonte, no por el número: 12 turnos semanales son 12 semanas.
    expect(Cadence.weekly.approximateTurnDays() * MAX_CIRCLE_TURNS).toBe(84);
    expect(Cadence.biweekly.approximateTurnDays() * MAX_CIRCLE_TURNS).toBe(168);
  });

  it('el máximo no se puede subir por variable de entorno', () => {
    expect(() =>
      validateEnvironment({ ...TEST_ENV, CIRCLE_TURNS_MIN: '2', CIRCLE_TURNS_MAX: '13' }),
    ).toThrow(/CIRCLE_TURNS_MAX/);
  });
});

describe('Gracia y mora de cada cadencia (COPAYNI-102)', () => {
  it('los valores por defecto son los decididos, y la mensual no cambia', () => {
    expect(env.DELINQUENCY_GRACE_DAYS_BY_CADENCE).toEqual(['biweekly:2', 'weekly:1']);
    expect(env.LATE_FEE_BPS_BY_CADENCE).toEqual(['biweekly:140', 'weekly:70']);
    expect([env.DELINQUENCY_GRACE_DAYS, env.LATE_FEE_BPS]).toEqual([3, 300]);
  });

  it('el criterio es igualar la carga anual, no el porcentaje por cuota', () => {
    // 300 bps doce veces al año son 3.600 bps anuales sobre el mismo capital. Mantener 300 en
    // semanal serían 15.600: cuatro veces más sin que nadie lo hubiera decidido.
    const yearly = (bps: number, cadence: Cadence) => bps * cadence.turnsPerYear();

    expect(yearly(env.LATE_FEE_BPS, Cadence.monthly)).toBe(3_600);
    for (const [bps, cadence] of [
      [140, Cadence.biweekly],
      [70, Cadence.weekly],
    ] as const) {
      expect(Math.abs(yearly(bps, cadence) - 3_600) / 3_600).toBeLessThan(0.02);
    }
    expect(yearly(env.LATE_FEE_BPS, Cadence.weekly)).toBe(15_600);
  });

  it('la gracia guarda la proporción del ciclo y nunca lo alcanza', () => {
    const grace = { monthly: env.DELINQUENCY_GRACE_DAYS, biweekly: 2, weekly: 1 };

    for (const [id, days] of Object.entries(grace)) {
      const cycleDays = Cadence.parse(id).approximateTurnDays();
      expect(days).toBeLessThan(cycleDays);
      // Entre un 7 % y un 15 % del ciclo en las tres: 3/30, 2/14 y 1/7.
      expect(days / cycleDays).toBeGreaterThan(0.07);
      expect(days / cycleDays).toBeLessThan(0.15);
    }
  });

  it('habilitar una cadencia ya no depende de estos valores, solo de la plantilla legal', () => {
    // Antes de la decisión, habilitar `weekly` fallaba también por la gracia y la mora. Ahora lo
    // único que lo bloquea es la aprobación del documento (COPAYNI-119).
    let message = '';
    try {
      validateEnvironment({
        ...TEST_ENV,
        CIRCLE_CADENCES_ENABLED: 'monthly,weekly',
        NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: 'weekly:1',
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/weekly no tiene plantilla de contrato aprobada/);
    expect(message).not.toMatch(/DELINQUENCY_GRACE_DAYS_BY_CADENCE|LATE_FEE_BPS_BY_CADENCE/);
  });
});

describe('Retención acotada como parte del pozo (COPAYNI-102)', () => {
  it('el tope configurado es el 25 % del pozo, con 60 días de cobertura', () => {
    expect(env.PAYOUT_RETENTION_MAX_POT_BPS).toBe(2_500);
    expect(env.PAYOUT_RETENTION_COVERAGE_DAYS).toBe(60);
  });

  it('una junta corta deja de retener la mitad del pozo', () => {
    // 4 turnos: sin tope, quien cobra primero ve retenidas 2 de sus 4 cuotas.
    expect(retained(monthly(4), 1, WITHOUT_CAP)).toBe(2);
    expect(retained(monthly(4), 1, WITH_CAP)).toBe(1);

    const { retention } = WITH_CAP.quote(monthly(4), 1);
    expect(retention.amount).toBeLessThanOrEqual(1_200_000 * 0.25);
  });

  it('en una mensual de 6 turnos la retención baja de 2 cuotas a 1: es lo que cambia', () => {
    // Consecuencia de la decisión sobre un producto que ya existe. El miembro recibe más al cobrar
    // y la protección baja de un 33 % del pozo a un 17 %.
    expect(retained(monthly(6), 1, WITHOUT_CAP)).toBe(2);
    expect(retained(monthly(6), 1, WITH_CAP)).toBe(1);
  });

  it('en una mensual de 10 y de 12 turnos no cambia nada', () => {
    for (const turns of [10, 12]) {
      const terms = monthly(turns);
      for (let position = 1; position <= turns - 2; position += 1) {
        expect(retained(terms, position, WITH_CAP)).toBe(2);
      }
    }
  });

  it('una junta mensual que ya existe conserva la retención que firmó (COPAYNI-122)', () => {
    // El tope solo gobierna las uniones nuevas: el precio queda congelado en la membresía
    // (`circle_memberships.price`) y `quoteOf` lo devuelve tal cual. Es lo que sostiene la
    // promesa de que ningún círculo en curso cambió de cuota ni de retención.
    const terms = monthly(6);
    const firmado = WITHOUT_CAP.quote(terms, 1);

    expect(WITH_CAP.quoteOf(terms, 1, priceOf(firmado)).retention).toEqual(firmado.retention);
    expect(
      retainedInstallments(WITH_CAP.quoteOf(terms, 1, priceOf(firmado)), terms.baseInstallment),
    ).toBe(2);
    // Y quien se une hoy a una junta igual recibe la retención acotada.
    expect(retained(terms, 1, WITH_CAP)).toBe(1);
  });

  it('en semanal el tope manda sobre los 60 días de cobertura', () => {
    // 60 días son 9 cuotas semanales, tres cuartas partes del pozo de una junta de 12 turnos. Con
    // el tope quedan 3, unas 3 semanas de cobertura.
    expect(retained(weekly(12), 1, WITHOUT_CAP)).toBe(9);
    expect(retained(weekly(12), 1, WITH_CAP)).toBe(3);
  });
});
