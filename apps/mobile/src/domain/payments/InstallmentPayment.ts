/** Con qué se paga una cuota desde la app (POST /me/installments/:id/pay, COPAYNI-63). */
export type InstallmentPaymentMethod =
  { method: 'yape'; phoneNumber: string; otp: string } | { method: 'card'; cardId: string };

/** `pending`: la pasarela lo está procesando y lo confirma después. */
export interface InstallmentPaymentResult {
  status: 'paid' | 'pending';
  /** Número de operación del recibo (pago, orden de Yape o `referral`). */
  paymentId: string;
  /** Cuándo quedó pagada (ISO 8601); `null` mientras está en proceso. */
  paidAt: string | null;
}
