/** Con qué se paga una cuota desde la app (POST /me/installments/:id/pay, COPAYNI-63). */
export type InstallmentPaymentMethod =
  { method: 'yape'; phoneNumber: string; otp: string } | { method: 'card'; cardId: string };

/** `pending`: la pasarela lo está procesando y lo confirma después. */
export interface InstallmentPaymentResult {
  status: 'paid' | 'pending';
  paymentId: string;
}
