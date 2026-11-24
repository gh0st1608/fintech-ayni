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
  /**
   * **Días de cobertura** que retiene el payout de cada turno (COPAYNI-112). Antes era un número
   * de cuotas, y el mismo número dejaba de significar lo mismo al cambiar la cadencia: 2 cuotas
   * cubren 2 meses en mensual y 2 semanas en semanal, así que la protección caía a una séptima
   * parte sin que nadie lo hubiera decidido. En días, la cobertura es la misma en toda cadencia y
   * el número de cuotas se deriva. 0 o ausente: sin retención.
   */
  retentionCoverageDays?: number;
  /**
   * Tope de la retención como parte del pozo, en puntos básicos (COPAYNI-112). Con el número de
   * turnos configurable, la retención cambia de proporción: 2 de 4 cuotas es el 50 % del pozo y 2
   * de 10 es el 20 %. Puede ser razonable —quien cobra primero es quien más riesgo tiene de dejar
   * de pagar— pero debe ser una decisión explícita y no una consecuencia del número de turnos.
   * 10000 (el valor por defecto) es sin tope efectivo.
   */
  retentionMaxPotBps?: number;
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
    const coverage = props.retentionCoverageDays ?? 0;
    if (!Number.isInteger(coverage) || coverage < 0 || coverage > 366) {
      throw new InvalidSlotPricingRulesError(
        'retentionCoverageDays debe ser un entero entre 0 y 366',
      );
    }
    const maxPot = props.retentionMaxPotBps ?? 10_000;
    if (!Number.isInteger(maxPot) || maxPot < 0 || maxPot > 10_000) {
      throw new InvalidSlotPricingRulesError(
        'retentionMaxPotBps debe ser un entero entre 0 y 10000',
      );
    }
    return new SlotPricingRules({
      ...props,
      retentionCoverageDays: coverage,
      retentionMaxPotBps: maxPot,
    });
  }
}
