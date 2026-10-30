/** Preferencias de Payment Settings (GET y PATCH /me/payment-settings, COPAYNI-38). */
export interface PaymentSettings {
  /** En su mes de cobro, la cuota se descuenta del payout en vez de cobrarse. */
  deductPayInFromPayout: boolean;
}
