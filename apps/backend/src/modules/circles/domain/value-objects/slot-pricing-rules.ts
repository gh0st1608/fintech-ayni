import { DomainError } from '../../../../shared/errors/app-error';
import { BPS_DENOMINATOR } from '../../../../shared/domain/value-objects/money';

export class InvalidSlotPricingRulesError extends DomainError {
  constructor(message: string) {
    super('INVALID_SLOT_PRICING_RULES', message);
  }
}

/** Cómo se cobran las Admin Fees (pending-scope R4: el Figma no lo deja claro). */
export const ADMIN_FEE_MODES = ['added_to_installments', 'deducted_from_payout'] as const;
export type AdminFeeMode = (typeof ADMIN_FEE_MODES)[number];

export interface SlotPricingRulesProps {
  /** Parte de los slots (desde el primero) que son "Fastest Payout" y pagan fee. */
  fastestShareBps: number;
  /** Parte de los slots (desde el último) que son "Highest Return" y reciben descuento. */
  highestShareBps: number;
  /** Fee del primer slot sobre el payout; baja linealmente hasta el último slot Fastest. */
  maxFeeBps: number;
  /** Descuento del último slot sobre el payout; baja linealmente hacia el primer slot Highest. */
  maxDiscountBps: number;
  /** Admin Fees sobre el payout, iguales para todos los slots. */
  adminFeeBps: number;
  adminFeeMode: AdminFeeMode;
}

const RATE_FIELDS = [
  'fastestShareBps',
  'highestShareBps',
  'maxFeeBps',
  'maxDiscountBps',
  'adminFeeBps',
] as const;

/**
 * Parámetros de precio de los slots. Las fórmulas de fees y descuentos están sin confirmar
 * (pending-scope R1 y R4): todo lo que puede cambiar está aquí, con las tasas en puntos
 * básicos (10000 = 100 %), y el cálculo vive en `SlotPricing`.
 */
export class SlotPricingRules {
  private constructor(readonly props: Readonly<SlotPricingRulesProps>) {}

  static create(props: SlotPricingRulesProps): SlotPricingRules {
    for (const field of RATE_FIELDS) {
      const value = props[field];
      if (!Number.isInteger(value) || value < 0 || value > BPS_DENOMINATOR) {
        throw new InvalidSlotPricingRulesError(`${field} debe ser un entero entre 0 y 10000`);
      }
    }
    if (props.fastestShareBps + props.highestShareBps > BPS_DENOMINATOR) {
      throw new InvalidSlotPricingRulesError(
        'Los slots Fastest y Highest no pueden superar el total de slots',
      );
    }
    if (!ADMIN_FEE_MODES.includes(props.adminFeeMode)) {
      throw new InvalidSlotPricingRulesError('adminFeeMode inválido');
    }
    return new SlotPricingRules({ ...props });
  }
}
