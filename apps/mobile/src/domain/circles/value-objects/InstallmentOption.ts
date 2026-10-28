import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

export class InvalidInstallmentOptionError extends DomainError {
  readonly code = 'INVALID_INSTALLMENT_OPTION';
}

/**
 * Combinación cuota × meses para un payout (Monthly Pay-in). El cálculo es del backend:
 * aquí solo se garantizan las invariantes.
 */
export class InstallmentOption {
  private constructor(
    readonly months: number,
    /** Cuota base: la del slot elegido varía con sus fees, descuentos y Admin Fees. */
    readonly installment: Money,
    /** false si la cuota supera el límite mensual de pay-in del usuario (R5). */
    readonly withinMonthlyLimit: boolean,
  ) {}

  static create({
    months,
    installment,
    withinMonthlyLimit = true,
  }: {
    months: number;
    installment: Money;
    withinMonthlyLimit?: boolean;
  }): InstallmentOption {
    if (!Number.isInteger(months) || months <= 0) {
      throw new InvalidInstallmentOptionError(`Invalid installment months: ${months}`);
    }
    if (installment.amount <= 0) {
      throw new InvalidInstallmentOptionError(`Invalid installment: ${installment.amount}`);
    }
    return new InstallmentOption(months, installment, withinMonthlyLimit);
  }

  /** Misma combinación, aunque su disponibilidad haya cambiado. */
  sameAs(other: InstallmentOption): boolean {
    return this.months === other.months && this.installment.equals(other.installment);
  }
}
