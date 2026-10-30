import type { PaymentSettings } from '../PaymentSettings';
import type { PaymentSummary } from '../PaymentSummary';
import type { PayoutEligibility } from '../PayoutEligibility';
import type { TransactionsPage, TransactionType } from '../Transaction';

/** Sección Payment del backend (docs/api/payments.md). */
export interface PaymentRepositoryPort {
  getSummary(signal?: AbortSignal): Promise<PaymentSummary>;
  /** Una página del historial, del más reciente al más antiguo. */
  listTransactions(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage>;
  getPayoutEligibility(signal?: AbortSignal): Promise<PayoutEligibility>;
  getSettings(signal?: AbortSignal): Promise<PaymentSettings>;
  /** Devuelve las preferencias guardadas. */
  updateSettings(settings: PaymentSettings): Promise<PaymentSettings>;
}
