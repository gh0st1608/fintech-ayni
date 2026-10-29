import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import {
  PAYMENTS_QUERY,
  type PaymentsQueryPort,
  type TransactionPage,
  type TransactionType,
} from '../ports/payments-query.port';

export const TRANSACTIONS_PAGE_SIZE = 20;

/** Historial de pagos y cobros (COPAYNI-41), paginado por cursor. */
@Injectable()
export class ListTransactionsUseCase {
  constructor(@Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort) {}

  execute(
    principal: Principal,
    query: { type: TransactionType; cursor: string | null; limit?: number },
  ): Promise<TransactionPage> {
    return this.payments.transactionsOf({
      userId: principal.userId,
      type: query.type,
      cursor: query.cursor,
      limit: query.limit ?? TRANSACTIONS_PAGE_SIZE,
    });
  }
}
