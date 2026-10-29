import { DomainError } from '@/domain/shared/errors/DomainError';
import { Money } from '@/domain/shared/value-objects/Money';

/** Tipos de turno del Figma (Slot, 55:9377), en el orden en que se muestran. */
export const SLOT_TYPES = ['fastestPayout', 'lowestFees', 'highestReturn'] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export class InvalidSlotError extends DomainError {
  readonly code = 'INVALID_SLOT';
}

/** El slot elegido se ocupó mientras el usuario decidía. */
export class SlotNoLongerAvailableError extends DomainError {
  readonly code = 'SLOT_NO_LONGER_AVAILABLE';
}

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Turno de cobro de un Game'ya: el mes en que el miembro recibe el payout. El precio (fee o
 * descuento) lo calcula el backend (pending-scope R1); aquí solo se garantizan las invariantes.
 */
export class Slot {
  private constructor(
    /** 1 = cobra el primer mes del círculo. */
    readonly position: number,
    /** Mes de cobro en formato YYYY-MM. */
    readonly payoutPeriod: string,
    readonly type: SlotType,
    /** Fee por cobrar antes (Fastest Payout); cero en los demás. */
    readonly fee: Money,
    /** Descuento en los pay-ins por cobrar al final (Highest Return); cero en los demás. */
    readonly discount: Money,
    readonly available: boolean,
    /** Círculo al que pertenece; `null` si es uno nuevo, que el backend abre al unirse. */
    readonly circleId: string | null,
    /**
     * Puesta al día de una vacante (COPAYNI-59): las cuotas de los meses ya transcurridos,
     * repartidas en sus cuotas hasta el mes de cobro. Cero en un turno normal.
     */
    readonly catchUp: Money,
  ) {}

  static create(props: {
    position: number;
    payoutPeriod: string;
    type: SlotType;
    fee: Money;
    discount: Money;
    available: boolean;
    circleId?: string | null;
    catchUp?: Money;
  }): Slot {
    const { position, payoutPeriod, type, fee, discount, available } = props;
    if (!Number.isInteger(position) || position < 1) {
      throw new InvalidSlotError(`Invalid slot position: ${position}`);
    }
    if (!PERIOD.test(payoutPeriod)) {
      throw new InvalidSlotError(`Invalid payout period: ${payoutPeriod}`);
    }
    if (fee.currency !== discount.currency || fee.amount < 0 || discount.amount < 0) {
      throw new InvalidSlotError('Slot fee and discount must be non-negative in one currency');
    }
    const catchUp = props.catchUp ?? Money.of(0, fee.currency);
    if (catchUp.currency !== fee.currency || catchUp.amount < 0) {
      throw new InvalidSlotError('Slot catch-up must be non-negative in the slot currency');
    }
    return new Slot(
      position,
      payoutPeriod,
      type,
      fee,
      discount,
      available,
      props.circleId ?? null,
      catchUp,
    );
  }

  /** Primer día del mes de cobro, para formatearlo con el idioma activo. */
  get payoutDate(): Date {
    const [year, month] = this.payoutPeriod.split('-').map(Number);
    return new Date(year!, month! - 1, 1);
  }
}

export interface SlotGroup {
  type: SlotType;
  /** En orden de cobro; incluye los ocupados para mostrarlos deshabilitados. */
  slots: Slot[];
}
