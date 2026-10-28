import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { DomainError } from '../../../../shared/errors/app-error';
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
}

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

    const upfront = adminFeeMode === 'added_to_installments' ? fee.add(adminFee) : fee;
    const upfrontShares = upfront.allocate(position);
    const discountShares = discount.allocate(months);
    const installments = Array.from({ length: months }, (_, month) =>
      terms.baseInstallment
        .add(month < position ? upfrontShares[month]! : Money.zero(currency))
        .subtract(discountShares[month]!),
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
    };
  }

  quoteAll(terms: CircleTerms): SlotQuote[] {
    return Array.from({ length: terms.months }, (_, index) => this.quote(terms, index + 1));
  }
}
