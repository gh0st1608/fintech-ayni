import type { InstallmentPaymentResult } from '../InstallmentPayment';
import type { PaymentSettings } from '../PaymentSettings';
import type { PaymentStreak } from '../PaymentStreak';
import type { PaymentSummary } from '../PaymentSummary';
import type { PayoutEligibility } from '../PayoutEligibility';
import type { TransactionDetail, TransactionsPage, TransactionType } from '../Transaction';
import type { DownloadedFile } from './FileSharePort';

/** Sección Payment del backend (docs/api/payments.md). */
export interface PaymentRepositoryPort {
  getSummary(signal?: AbortSignal): Promise<PaymentSummary>;
  /** Una página del historial, del más reciente al más antiguo. */
  /** Racha de pagos a tiempo del icono de fuego (COPAYNI-82). */
  getPaymentStreak(signal?: AbortSignal): Promise<PaymentStreak>;
  /** Un movimiento del historial; si no es del usuario falla con `TRANSACTION_NOT_FOUND`. */
  getTransaction(
    type: TransactionType,
    id: string,
    signal?: AbortSignal,
  ): Promise<TransactionDetail>;
  /** El comprobante en PDF de un movimiento (COPAYNI-80), en el idioma pedido. */
  getReceipt(type: TransactionType, id: string, language: string): Promise<DownloadedFile>;
  listTransactions(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage>;
  getPayoutEligibility(signal?: AbortSignal): Promise<PayoutEligibility>;
  getSettings(signal?: AbortSignal): Promise<PaymentSettings>;
  /** Devuelve las preferencias guardadas. */
  updateSettings(settings: PaymentSettings): Promise<PaymentSettings>;
  /**
   * Paga la cuota con un token de Yape o una tarjeta guardada. Con Yape va también el celular con
   * el que se generó el token: la orden de Mercado Pago lo pide. El OTP nunca va al backend.
   */
  payInstallment(
    installmentId: string,
    payment:
      { method: 'yape'; token: string; phoneNumber: string } | { method: 'card'; cardId: string },
    idempotencyKey: string,
  ): Promise<InstallmentPaymentResult>;
}
