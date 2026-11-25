import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { Cadence } from '../MyCircleDetail';

export class InvalidInstallmentOptionError extends DomainError {
  readonly code = 'INVALID_INSTALLMENT_OPTION';
}

/**
 * Combinación cuota × turnos para un payout (Monthly Pay-in). El cálculo es del backend:
 * aquí solo se garantizan las invariantes.
 *
 * El número de turnos **no** es una duración en meses: 12 turnos son 12 meses en cadencia
 * mensual y unas 12 semanas en semanal (COPAYNI-116). La duración viene del servidor en
 * `approximateDays` y la unidad en `unit`; la app no la calcula.
 */
export class InstallmentOption {
  private constructor(
    readonly turns: number,
    /** Cuota base: la del slot elegido varía con sus fees, descuentos y Admin Fees. */
    readonly installment: Money,
    /** false si la cuota supera el límite mensual de pay-in del usuario (R5). */
    readonly withinMonthlyLimit: boolean,
    readonly cadence: Cadence,
    /** Cómo se llama un turno de esa cadencia: «Mes», «Quincena», «Semana». */
    readonly unit: string,
    /** Días corridos que dura la junta con esa combinación. */
    readonly approximateDays: number,
  ) {}

  /**
   * El número de turnos, bajo su nombre anterior.
   *
   * @deprecated Usar `turns`. Se mantiene porque el contrato de unión y varias pantallas lo
   * llaman así, y porque sigue siendo el número de puestos y de cuotas.
   */
  get months(): number {
    return this.turns;
  }

  /** Acepta `turns` o su nombre anterior `months`: es el mismo número. */
  static create({
    turns,
    months,
    installment,
    withinMonthlyLimit = true,
    cadence = 'monthly',
    unit = 'Mes',
    approximateDays,
  }: {
    turns?: number;
    months?: number;
    installment: Money;
    withinMonthlyLimit?: boolean;
    cadence?: Cadence;
    unit?: string;
    approximateDays?: number;
  }): InstallmentOption {
    const count = turns ?? months;
    if (count === undefined || !Number.isInteger(count) || count <= 0) {
      throw new InvalidInstallmentOptionError(`Invalid installment turns: ${String(count)}`);
    }
    if (installment.amount <= 0) {
      throw new InvalidInstallmentOptionError(`Invalid installment: ${installment.amount}`);
    }
    return new InstallmentOption(
      count,
      installment,
      withinMonthlyLimit,
      cadence,
      unit,
      approximateDays ?? count * 30,
    );
  }

  /** Misma combinación, aunque su disponibilidad haya cambiado. */
  sameAs(other: InstallmentOption): boolean {
    return (
      this.turns === other.turns &&
      this.cadence === other.cadence &&
      this.installment.equals(other.installment)
    );
  }
}
