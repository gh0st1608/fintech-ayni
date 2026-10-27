import { DomainError } from '../../../../shared/errors/app-error';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type PayoutRange } from '../value-objects/payout-range';

export class InvalidJoinConfigError extends DomainError {
  constructor(message: string) {
    super('INVALID_JOIN_CONFIG', message);
  }
}

/**
 * Montos con los que un usuario puede unirse a un Game'ya o al programa de ahorro
 * (COPAYNI-27, COPAYNI-28). `userPayoutLimit` es null mientras no se restrinja (R5).
 */
export class JoinConfig {
  private constructor(
    readonly payoutRange: PayoutRange,
    readonly savingProgramMax: Money,
    readonly userPayoutLimit: Money | null,
  ) {}

  static create(props: {
    payoutRange: PayoutRange;
    savingProgramMax: Money;
    userPayoutLimit: Money | null;
  }): JoinConfig {
    const { payoutRange, savingProgramMax, userPayoutLimit } = props;
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
    return new JoinConfig(payoutRange, savingProgramMax, userPayoutLimit);
  }
}
