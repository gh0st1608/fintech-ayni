import { DomainError } from '../../../../shared/errors/app-error';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { MIN_CIRCLE_MONTHS } from '../value-objects/circle-terms';
import { type PayoutRange } from '../value-objects/payout-range';

export class InvalidJoinConfigError extends DomainError {
  constructor(message: string) {
    super('INVALID_JOIN_CONFIG', message);
  }
}

/**
 * Montos y duraciones con los que un usuario puede unirse a un Game'ya o al programa de
 * ahorro (COPAYNI-27 a 29). `userPayoutLimit` es null mientras no se restrinja (R5).
 */
export class JoinConfig {
  private constructor(
    readonly payoutRange: PayoutRange,
    readonly savingProgramMax: Money,
    readonly userPayoutLimit: Money | null,
    /** Duraciones del Game'ya en meses, de menor a mayor. */
    readonly durationOptions: readonly number[],
  ) {}

  static create(props: {
    payoutRange: PayoutRange;
    savingProgramMax: Money;
    userPayoutLimit: Money | null;
    durationOptions: readonly number[];
  }): JoinConfig {
    const { payoutRange, savingProgramMax, userPayoutLimit, durationOptions } = props;
    if (!savingProgramMax.isPositive()) {
      throw new InvalidJoinConfigError('El máximo del programa de ahorro debe ser positivo');
    }
    const amounts = [savingProgramMax, ...(userPayoutLimit ? [userPayoutLimit] : [])];
    if (amounts.some((money) => money.currency !== payoutRange.currency)) {
      throw new InvalidJoinConfigError('Todos los montos deben estar en la moneda del payout');
    }
    if (userPayoutLimit && userPayoutLimit.amount < 0) {
      throw new InvalidJoinConfigError('El límite de payout del usuario no puede ser negativo');
    }
    if (
      durationOptions.length === 0 ||
      durationOptions.some((months) => !Number.isInteger(months) || months < MIN_CIRCLE_MONTHS)
    ) {
      throw new InvalidJoinConfigError(
        `Las duraciones deben ser enteros de al menos ${MIN_CIRCLE_MONTHS} meses`,
      );
    }
    const durations = [...new Set(durationOptions)].sort((a, b) => a - b);
    return new JoinConfig(payoutRange, savingProgramMax, userPayoutLimit, durations);
  }

  /** Si el usuario puede elegir este payout: dentro del rango, en un salto y bajo su límite. */
  allowsPayout(payout: Money): boolean {
    return (
      this.payoutRange.contains(payout) &&
      (this.userPayoutLimit === null || payout.amount <= this.userPayoutLimit.amount)
    );
  }
}
