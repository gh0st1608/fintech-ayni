import {
  retainedInstallments,
  SlotPricing,
} from '@src/modules/circles/domain/services/slot-pricing';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TEST_PRICING_RULES } from '@test/support/join-circle.fixture';

/**
 * La retención del payout en días de cobertura (COPAYNI-112).
 *
 * `PAYOUT_RETENTION_INSTALLMENTS = 2` retenía dos cuotas: en mensual eso cubre 2 meses y en
 * semanal 2 semanas. El número era el mismo y la protección caía a una séptima parte, sin que
 * nadie lo hubiera decidido. En días, la cobertura significa lo mismo en toda cadencia.
 *
 * La segunda dimensión es el número de turnos: 2 de 4 cuotas es el 50 % del pozo y 2 de 10 es el
 * 20 %. Puede ser razonable —quien cobra primero es quien más riesgo tiene de dejar de pagar—
 * pero tiene que ser una decisión explícita, y para eso está el tope sobre el pozo.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');

const pricing = (coverageDays: number, maxPotBps = 10_000) =>
  new SlotPricing(
    SlotPricingRules.create({
      ...TEST_PRICING_RULES.props,
      retentionCoverageDays: coverageDays,
      retentionMaxPotBps: maxPotBps,
    }),
  );

const monthly = (turns: number) =>
  CircleTerms.create({ payout: pen(1_200_000), turns, startsOn: Period.of(2026, 11) });

const weekly = (turns: number) =>
  CircleTerms.create({
    payout: pen(1_200_000),
    turns,
    cadence: Cadence.weekly,
    startsOn: LocalDate.parse('2026-11-04'),
  });

/** Cuántas cuotas base cubre la retención de ese slot. */
const retained = (terms: CircleTerms, position: number, rules: SlotPricing) =>
  retainedInstallments(rules.quote(terms, position), terms.baseInstallment);

describe('Retención en días de cobertura (COPAYNI-112)', () => {
  it.each([6, 10, 12])(
    'en una junta mensual de %i turnos retiene lo mismo que antes del cambio',
    (turns) => {
      // 60 días de cobertura son exactamente las 2 cuotas que se retenían con
      // `PAYOUT_RETENTION_INSTALLMENTS = 2`. Es la prueba de equivalencia del ticket.
      const terms = monthly(turns);
      const rules = pricing(60);

      for (let position = 1; position <= turns - 2; position += 1) {
        expect(retained(terms, position, rules)).toBe(2);
        expect(rules.quote(terms, position).retention).toEqual(terms.baseInstallment.times(2));
      }
    },
  );

  it('en una junta semanal cubre los mismos días, no el mismo número de cuotas', () => {
    // 60 días son 9 cuotas semanales (ceil(60 / 7)); con 2 se habrían cubierto 14 días.
    const terms = weekly(12);

    expect(retained(terms, 1, pricing(60))).toBe(9);
    expect(retained(terms, 1, pricing(14))).toBe(2);
    expect(retained(terms, 1, pricing(7))).toBe(1);
  });

  it('el tope sobre el pozo acota lo que retiene una junta corta', () => {
    // 4 turnos, cobertura de 60 días: sin tope retiene 2 de 4 cuotas, la mitad del pozo.
    const terms = monthly(4);
    expect(retained(terms, 1, pricing(60))).toBe(2);

    // Con el tope en el 25 % del pozo, una sola cuota.
    expect(retained(terms, 1, pricing(60, 2_500))).toBe(1);
    // Y en una de 10 turnos el mismo tope no muerde: 2 de 10 ya es el 20 %.
    expect(retained(monthly(10), 1, pricing(60, 2_500))).toBe(2);
  });

  it('nunca retiene más de las cuotas que le quedan al miembro tras cobrar', () => {
    const terms = monthly(4);
    const rules = pricing(60);

    // Al turno 3 le queda una cuota y al 4 ninguna: quien cobra último no retiene nada.
    expect(retained(terms, 3, rules)).toBe(1);
    expect(retained(terms, 4, rules)).toBe(0);
    expect(rules.quote(terms, 4).retention.isZero()).toBe(true);
  });

  it('una cobertura mayor que la junta no desborda: se queda en lo que queda', () => {
    // 366 días de cobertura en una junta mensual de 6 turnos: el turno 1 retiene sus 5 restantes.
    const terms = monthly(6);

    expect(retained(terms, 1, pricing(366))).toBe(5);
    expect(retained(terms, 6, pricing(366))).toBe(0);
  });

  it('sin cobertura configurada no hay retención, como antes de COPAYNI-60', () => {
    const terms = monthly(10);

    expect(retained(terms, 1, pricing(0))).toBe(0);
    // Y entonces el payout neto es el pozo completo.
    expect(pricing(0).quote(terms, 1).netPayout).toEqual(terms.payout);
  });

  it('la regla valida la cobertura y el tope', () => {
    expect(() =>
      SlotPricingRules.create({ ...TEST_PRICING_RULES.props, retentionCoverageDays: 366 }),
    ).not.toThrow();
    expect(() =>
      SlotPricingRules.create({ ...TEST_PRICING_RULES.props, retentionCoverageDays: 367 }),
    ).toThrow(/retentionCoverageDays/);
    expect(() =>
      SlotPricingRules.create({ ...TEST_PRICING_RULES.props, retentionMaxPotBps: 10_001 }),
    ).toThrow(/retentionMaxPotBps/);
  });
});
