import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type { TransactionsPage, TransactionType } from '@/domain/payments/Transaction';

/** Resumen de pagos de la pestaña Payment (COPAYNI-35). */
export class GetPaymentSummaryUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PaymentSummary> {
    return this.repository.getSummary(signal);
  }
}

/** Historial de pagos o de cobros, por páginas (COPAYNI-41). */
export class ListTransactionsUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage> {
    return this.repository.listTransactions(type, cursor, signal);
  }
}
