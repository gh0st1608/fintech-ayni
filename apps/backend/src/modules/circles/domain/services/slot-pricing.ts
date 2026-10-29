import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { ConflictError, DomainError } from '../../../../shared/errors/app-error';
import { type CircleTerms } from '../value-objects/circle-terms';
import { type SlotPricingRules } from '../value-objects/slot-pricing-rules';

/** Tipos de turno del Figma (Slot, 55:9377): primeros, intermedios y últimos slots. */
export const SLOT_TYPES = ['fastest_payout', 'lowest_fees', 'highest_return'] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export class SlotOutOfRangeError extends DomainError {
  constructor(months: number) {
    super('SLOT_OUT_OF_RANGE', `El slot debe estar entre 1 y ${months}`);
  }
}

/**
 * La vacante ya no se puede tomar: su mes de cobro venció o el círculo no la ofrece (COPAYNI-59).
 */
export class VacancyClosedError extends ConflictError {
  constructor() {
    super('VACANCY_CLOSED', 'El turno vacante ya no se puede tomar');
  }
}

export interface SlotQuote {
  /** 1 = cobra el primer mes. */
  position: number;
  payoutPeriod: Period;
  type: SlotType;
  /** Fee por cobrar antes (solo Fastest Payout). */
  fee: Money;
  /** Descuento por cobrar al final (solo Highest Return). */
  discount: Money;
  adminFee: Money;
  /** Una cuota por mes del círculo, en orden. */
  installments: Money[];
  totalPaid: Money;
  /** Lo que recibe el miembro en su mes de cobro. */
  netPayout: Money;
  /**
   * Puesta al día de quien toma una vacante (COPAYNI-59): la parte de cada cuota que paga los
   * meses ya transcurridos y va al fondo de garantía. Falta en un slot normal.
   */
  catchUp?: Money[];
}

/**
 * Precio del slot congelado al unirse (COPAYNI-55): lo que el miembro aceptó. Un cambio posterior
 * de `SlotPricingRules` no lo altera. El resto de `SlotQuote` se deriva de las condiciones.
 */
export type SlotPrice = Pick<
  SlotQuote,
  'type' | 'fee' | 'discount' | 'adminFee' | 'installments' | 'netPayout' | 'catchUp'
>;

export const priceOf = ({
  type,
  fee,
  discount,
  adminFee,
  installments,
  netPayout,
  catchUp,
}: SlotQuote): SlotPrice => ({
  type,
  fee,
  discount,
  adminFee,
  installments,
  netPayout,
  ...(catchUp && { catchUp }),
});

/** Total de la puesta al día de un slot; cero si no la tiene. */
export const catchUpTotal = (quote: Pick<SlotQuote, 'catchUp' | 'netPayout'>): Money =>
  (quote.catchUp ?? []).reduce(
    (sum, share) => sum.add(share),
    Money.zero(quote.netPayout.currency),
  );

/**
 * Precio de cada slot según `SlotPricingRules`. Reglas visibles en el Figma (55:9444):
 * los primeros slots pagan fee, los intermedios no, los últimos reciben descuento, y las
 * Admin Fees se reparten en partes iguales hasta el mes de payout.
 *
 * Supuestos provisionales, a validar con el PO (pending-scope R1 y R4):
 * - El fee del slot también se reparte en partes iguales hasta el mes de payout.
 * - El descuento se reparte en partes iguales entre todas las cuotas.
 * - Fee y descuento varían linealmente según la distancia al extremo de su grupo.
 */
export class SlotPricing {
  constructor(private readonly rules: SlotPricingRules) {}

  /** Cuántos slots son Fastest Payout y cuántos Highest Return para `months` slots. */
  tiers(months: number): { fastest: number; highest: number } {
    const { fastestShareBps, highestShareBps } = this.rules.props;
    return {
      fastest: Math.floor((months * fastestShareBps) / 10_000),
      highest: Math.floor((months * highestShareBps) / 10_000),
    };
  }

  typeOf(position: number, months: number): SlotType {
    const { fastest, highest } = this.tiers(months);
    if (position <= fastest) return 'fastest_payout';
    if (position > months - highest) return 'highest_return';
    return 'lowest_fees';
  }

  quote(terms: CircleTerms, position: number): SlotQuote {
    return this.price(terms, position, 0);
  }

  /**
   * Precio de la vacante `position` para quien la toma desde el mes `joinMonth` (0 = el primer mes
   * del círculo), COPAYNI-59 y pending-scope §3.1 (R17):
   * - No paga los meses anteriores a `joinMonth`: su cuota es cero.
   * - Paga la puesta al día (las cuotas base de esos meses), repartida en partes iguales entre sus
   *   cuotas hasta su mes de cobro, igual que el fee y las Admin Fees.
   * - El descuento se reparte entre sus cuotas restantes. Fee, descuento y payout son los del turno.
   * Solo se puede tomar antes de su mes de cobro o en ese mes: `joinMonth < position`.
   */
  replacementQuote(terms: CircleTerms, position: number, joinMonth: number): SlotQuote {
    if (!Number.isInteger(joinMonth) || joinMonth < 1 || joinMonth >= position) {
      throw new VacancyClosedError();
    }
    return this.price(terms, position, joinMonth);
  }

  private price(terms: CircleTerms, position: number, joinMonth: number): SlotQuote {
    const { months, payout, currency } = terms;
    if (!Number.isInteger(position) || position < 1 || position > months) {
      throw new SlotOutOfRangeError(months);
    }
    const { maxFeeBps, maxDiscountBps, adminFeeBps, adminFeeMode } = this.rules.props;
    const { fastest, highest } = this.tiers(months);
    const type = this.typeOf(position, months);

    const fee =
      type === 'fastest_payout'
        ? payout.percentage(maxFeeBps, fastest - position + 1, fastest)
        : Money.zero(currency);
    const discount =
      type === 'highest_return'
        ? payout.percentage(maxDiscountBps, position - (months - highest), highest)
        : Money.zero(currency);
    const adminFee = payout.percentage(adminFeeBps);

    const zero = Money.zero(currency);
    const upfront = adminFeeMode === 'added_to_installments' ? fee.add(adminFee) : fee;
    const upfrontShares = upfront.allocate(position - joinMonth);
    const catchUpShares = terms.baseInstallment.times(joinMonth).allocate(position - joinMonth);
    const discountShares = discount.allocate(months - joinMonth);
    const share = (shares: Money[], month: number, until: number) =>
      month >= joinMonth && month < until ? shares[month - joinMonth]! : zero;
    const catchUp = Array.from({ length: months }, (_, month) =>
      share(catchUpShares, month, position),
    );
    const installments = Array.from({ length: months }, (_, month) =>
      month < joinMonth
        ? zero
        : terms.baseInstallment
            .add(share(upfrontShares, month, position))
            .add(catchUp[month]!)
            .subtract(share(discountShares, month, months)),
    );

    return {
      position,
      payoutPeriod: terms.payoutPeriodOf(position),
      type,
      fee,
      discount,
      adminFee,
      installments,
      totalPaid: installments.reduce((sum, installment) => sum.add(installment)),
      netPayout: adminFeeMode === 'deducted_from_payout' ? payout.subtract(adminFee) : payout,
      ...(joinMonth > 0 && { catchUp }),
    };
  }

  /**
   * El precio de una membresía: el congelado al unirse o, si no lo tiene (membresías anteriores
   * a COPAYNI-55), el que resulta de las reglas vigentes.
   */
  quoteOf(terms: CircleTerms, position: number, price: SlotPrice | undefined): SlotQuote {
    if (!price) return this.quote(terms, position);
    return {
      ...price,
      position,
      payoutPeriod: terms.payoutPeriodOf(position),
      totalPaid: price.installments.reduce((sum, installment) => sum.add(installment)),
    };
  }

  quoteAll(terms: CircleTerms): SlotQuote[] {
    return Array.from({ length: terms.months }, (_, index) => this.quote(terms, index + 1));
  }
}
