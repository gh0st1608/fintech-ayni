import { DomainError } from '../../../../shared/errors/app-error';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';

export class InvalidCircleTermsError extends DomainError {
  constructor(message: string) {
    super('INVALID_CIRCLE_TERMS', message);
  }
}

/** Un círculo necesita al menos dos miembros para que haya a quién pagarle cada mes. */
export const MIN_CIRCLE_MONTHS = 2;

/**
 * Condiciones de un Game'ya: cada mes se paga `payout` a un miembro, durante `months` meses
 * desde `startsOn`. Hay tantos miembros como meses (un slot por mes) y la cuota base es
 * `payout / months`.
 *
 * Supuesto provisional (pending-scope R2): la cuota base es exacta en céntimos; montos que no
 * se dividen exactamente no se ofrecen, para no repartir redondeos entre miembros.
 */
export class CircleTerms {
  private constructor(
    readonly payout: Money,
    readonly months: number,
    readonly startsOn: Period,
    readonly baseInstallment: Money,
  ) {}

  static create(props: { payout: Money; months: number; startsOn: Period }): CircleTerms {
    const { payout, months, startsOn } = props;
    if (!payout.isPositive()) {
      throw new InvalidCircleTermsError('El payout debe ser positivo');
    }
    if (!Number.isInteger(months) || months < MIN_CIRCLE_MONTHS) {
      throw new InvalidCircleTermsError(
        `La duración debe ser de al menos ${MIN_CIRCLE_MONTHS} meses`,
      );
    }
    if (!CircleTerms.divides(payout, months)) {
      throw new InvalidCircleTermsError('El payout debe dividirse en cuotas exactas');
    }
    const [baseInstallment] = payout.allocate(months);
    return new CircleTerms(payout, months, startsOn, baseInstallment!);
  }

  /** Si `payout` se reparte en `months` cuotas iguales sin resto. */
  static divides(payout: Money, months: number): boolean {
    return Number.isInteger(months) && months > 0 && payout.amount % months === 0;
  }

  /** Mes en que cobra el slot `position` (1 = primer mes). */
  payoutPeriodOf(position: number): Period {
    return this.startsOn.addMonths(position - 1);
  }

  get currency(): string {
    return this.payout.currency;
  }
}
