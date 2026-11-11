import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { NotFoundError } from '../../../../shared/errors/app-error';
import {
  PAYMENTS_QUERY,
  type PaymentsQueryPort,
  type TransactionDetail,
  type TransactionType,
} from '../ports/payments-query.port';

/**
 * Detalle de un pago o un cobro del historial (COPAYNI-78, diseño D8). Solo los del usuario: uno
 * ajeno responde como inexistente.
 */
@Injectable()
export class GetTransactionUseCase {
  constructor(@Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort) {}

  async execute(
    principal: Principal,
    query: { type: TransactionType; id: string },
  ): Promise<TransactionDetail> {
    const found = await this.payments.transactionOf({ userId: principal.userId, ...query });
    if (!found) throw new NotFoundError('No se encontró el movimiento', 'TRANSACTION_NOT_FOUND');
    return found;
  }
}
