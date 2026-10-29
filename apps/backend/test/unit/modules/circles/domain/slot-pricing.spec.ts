import { installmentOptions } from '@src/modules/circles/domain/services/installment-options';
import {
  priceOf,
  SlotPricing,
  type SlotQuote,
} from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import {
  SlotPricingRules,
  type SlotPricingRulesProps,
} from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number): Money => Money.of(amount, 'PEN');
const amounts = (list: Money[]): number[] => list.map(({ amount }) => amount);

/** Parámetros de prueba: no son las reglas de negocio (pending-scope R1 y R4). */
const RULES: SlotPricingRulesProps = {
  fastestShareBps: 2_500,
  highestShareBps: 2_500,
  maxFeeBps: 1_000,
  maxDiscountBps: 500,
  adminFeeBps: 1_200,
  adminFeeMode: 'added_to_installments',
};

const pricing = (overrides: Partial<SlotPricingRulesProps> = {}): SlotPricing =>
  new SlotPricing(SlotPricingRules.create({ ...RULES, ...overrides }));

/** Tarjeta recomendada del Figma: payout de 24.000 en 12 meses de 2.000. */
const terms = (payout = 2_400_000, months = 12): CircleTerms =>
  CircleTerms.create({ payout: pen(payout), months, startsOn: Period.of(2026, 11) });

/** Lo que paga un slot en total, según sus componentes. */
const expectedTotal = (quote: SlotQuote, payout: Money, adminAdded: boolean): number =>
  payout.amount +
  quote.fee.amount +
  (adminAdded ? quote.adminFee.amount : 0) -
  quote.discount.amount;

describe('CircleTerms', () => {
  it('calcula la cuota base y el mes de cobro de cada slot', () => {
    const circle = terms();
    expect(circle.baseInstallment.amount).toBe(200_000);
    expect(circle.payoutPeriodOf(1).toString()).toBe('2026-11');
    expect(circle.payoutPeriodOf(12).toString()).toBe('2027-10');
    expect(circle.currency).toBe('PEN');
  });

  it.each([
    ['payout no positivo', { payout: pen(0), months: 12 }],
    ['menos de 2 meses', { payout: pen(1_000), months: 1 }],
    ['meses no enteros', { payout: pen(1_000), months: 2.5 }],
    ['cuotas no exactas', { payout: pen(1_000), months: 3 }],
  ])('rechaza %s', (_case, props) => {
    expect(() => CircleTerms.create({ ...props, startsOn: Period.of(2026, 1) })).toThrow(
      expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }),
    );
  });
});

describe('installmentOptions', () => {
  it('ofrece las combinaciones del Figma para un payout de 30.000', () => {
    const options = installmentOptions(pen(3_000_000), [12, 6, 10]);

    expect(options.map(({ months, installment }) => [months, installment.amount])).toEqual([
      [6, 500_000],
      [10, 300_000],
      [12, 250_000],
    ]);
  });

  it('omite duraciones repetidas, menores a 2 meses o con cuotas no exactas', () => {
    const options = installmentOptions(pen(1_000_000), [3, 4, 4, 1, 8]);
    expect(options.map(({ months }) => months)).toEqual([4, 8]);
  });

  it('acepta los extremos del rango del Figma (3.000 y 120.000)', () => {
    expect(installmentOptions(pen(300_000), [6, 12]).map(({ months }) => months)).toEqual([6, 12]);
    expect(installmentOptions(pen(12_000_000), [24])[0]?.installment.amount).toBe(500_000);
  });
});

describe('SlotPricingRules', () => {
  it.each([
    ['tasa negativa', { maxFeeBps: -1 }],
    ['tasa sobre 100 %', { maxDiscountBps: 10_001 }],
    ['tasa no entera', { adminFeeBps: 1.5 }],
    ['grupos que superan el total', { fastestShareBps: 6_000, highestShareBps: 5_000 }],
    ['modo de Admin Fees desconocido', { adminFeeMode: 'otro' as never }],
  ])('rechaza %s', (_case, overrides) => {
    expect(() => SlotPricingRules.create({ ...RULES, ...overrides })).toThrow(
      expect.objectContaining({ code: 'INVALID_SLOT_PRICING_RULES' }),
    );
  });
});

describe('SlotPricing', () => {
  it('clasifica los slots: primeros Fastest, intermedios Lowest Fees, últimos Highest Return', () => {
    const types = pricing()
      .quoteAll(terms())
      .map(({ type }) => type);

    expect(types).toEqual([
      ...Array(3).fill('fastest_payout'),
      ...Array(6).fill('lowest_fees'),
      ...Array(3).fill('highest_return'),
    ]);
  });

  it('cobra un fee que baja desde el primer slot y da un descuento que sube hasta el último', () => {
    const quotes = pricing().quoteAll(terms());

    expect(amounts(quotes.map(({ fee }) => fee))).toEqual([
      240_000, 160_000, 80_000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(amounts(quotes.map(({ discount }) => discount))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 40_000, 80_000, 120_000,
    ]);
    // 12 % de 24.000 = 2.880, como en la tarjeta del Figma.
    expect(new Set(amounts(quotes.map(({ adminFee }) => adminFee)))).toEqual(new Set([288_000]));
  });

  it('primer slot: fee y Admin Fees se pagan en la única cuota hasta el payout', () => {
    const first = pricing().quote(terms(), 1);

    expect(first.payoutPeriod.toString()).toBe('2026-11');
    expect(amounts(first.installments)).toEqual([728_000, ...Array(11).fill(200_000)]);
    expect(first.totalPaid.amount).toBe(2_928_000);
    expect(first.netPayout.amount).toBe(2_400_000);
  });

  it('último slot: Admin Fees en las 12 cuotas y descuento repartido entre todas', () => {
    const last = pricing().quote(terms(), 12);

    expect(last.payoutPeriod.toString()).toBe('2027-10');
    // 200.000 + 288.000/12 − 120.000/12
    expect(amounts(last.installments)).toEqual(Array(12).fill(214_000));
    expect(last.totalPaid.amount).toBe(2_568_000);
  });

  it('con Admin Fees descontadas del payout, las cuotas no las incluyen', () => {
    const middle = pricing({ adminFeeMode: 'deducted_from_payout' }).quote(terms(), 6);

    expect(amounts(middle.installments)).toEqual(Array(12).fill(200_000));
    expect(middle.netPayout.amount).toBe(2_112_000);
  });

  it.each([
    ['added_to_installments', true],
    ['deducted_from_payout', false],
  ] as const)(
    'cuadra cada slot sin cuotas negativas ni céntimos perdidos (%s)',
    (adminFeeMode, adminAdded) => {
      // Montos que no se dividen exacto: fuerza restos en todos los repartos.
      const circle = terms(1_000_010, 10);
      for (const quote of pricing({ adminFeeMode, maxDiscountBps: 10_000 }).quoteAll(circle)) {
        expect(quote.installments).toHaveLength(10);
        expect(quote.installments.every((installment) => !installment.isNegative())).toBe(true);
        expect(quote.totalPaid.amount).toBe(expectedTotal(quote, circle.payout, adminAdded));
      }
    },
  );

  it('sin grupos Fastest ni Highest, todos los slots son Lowest Fees sin ajustes', () => {
    const quotes = pricing({ fastestShareBps: 0, highestShareBps: 0 }).quoteAll(terms());

    expect(quotes.every(({ type }) => type === 'lowest_fees')).toBe(true);
    expect(quotes.every(({ fee, discount }) => fee.isZero() && discount.isZero())).toBe(true);
  });

  it('con pocos slots, los grupos se redondean hacia abajo', () => {
    expect(pricing().tiers(2)).toEqual({ fastest: 0, highest: 0 });
    expect(pricing().tiers(4)).toEqual({ fastest: 1, highest: 1 });
  });

  it.each([0, 13, 1.5])('rechaza el slot %p fuera de rango', (position) => {
    expect(() => pricing().quote(terms(), position)).toThrow(
      expect.objectContaining({ code: 'SLOT_OUT_OF_RANGE' }),
    );
  });

  it('quoteOf devuelve el precio congelado aunque las reglas cambien (COPAYNI-55)', () => {
    const accepted = pricing().quote(terms(), 2);
    const later = pricing({ adminFeeBps: 2_000, maxFeeBps: 1_500 });

    expect(later.quoteOf(terms(), 2, priceOf(accepted))).toEqual(accepted);
    expect(later.quoteOf(terms(), 2, undefined)).toEqual(later.quote(terms(), 2));
    expect(later.quote(terms(), 2)).not.toEqual(accepted);
  });
});
