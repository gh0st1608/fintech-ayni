import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Money } from '../../../../shared/domain/value-objects/money';
import { ValidationError } from '../../../../shared/errors/app-error';
import { LedgerTransaction } from '../../domain/value-objects/ledger-transaction';
import { GUARANTEE_FUND, type GuaranteeFundPort } from '../ports/guarantee-fund.port';

export interface FundMovementCommand {
  /** `seed_capital`: aporte inicial de la cooperativa; `adjustment`: corrección compensatoria. */
  kind: 'seed_capital' | 'adjustment';
  /** Positivo: entra al fondo; negativo (solo `adjustment`): sale. */
  amount: Money;
  reason: string;
  /** Clave de idempotencia de la operación (la genera el back-office una vez por operación). */
  operationId: string;
}

/**
 * Movimiento manual del fondo de garantía (COPAYNI-58): el capital semilla (R18, monto del PO) y
 * las correcciones. Nada se borra ni se edita: una corrección es otro movimiento con su motivo.
 * Lo invocará el back-office con el rol de admin general y 4-eyes (backoffice-plan.md).
 */
@Injectable()
export class RecordFundMovementUseCase {
  private readonly logger = new Logger('GuaranteeFund');

  constructor(@Inject(GUARANTEE_FUND) private readonly fund: GuaranteeFundPort) {}

  async execute(command: FundMovementCommand): Promise<boolean> {
    const { kind, amount, reason, operationId } = command;
    if (kind === 'seed_capital' ? !amount.isPositive() : amount.isZero()) {
      throw new ValidationError('El monto del movimiento no es válido', { amount: 'invalid' });
    }
    const transaction = LedgerTransaction.transfer({
      key: `${kind}:${operationId}`,
      kind,
      from: { account: 'external' },
      to: { account: 'guarantee_fund' },
      amount,
      reason,
    });
    const recorded = await this.fund.record(transaction!);
    if (recorded) {
      this.logger.log({
        event: 'guarantee_fund.manual_movement',
        kind,
        operationId,
        amount: amount.amount,
        currency: amount.currency,
        reason,
      });
    }
    return recorded;
  }
}
