export const PAYMENT_SETTINGS = Symbol('PAYMENT_SETTINGS');

/** Preferencias de pago del usuario (Payment Settings, COPAYNI-38). */
export interface PaymentSettings {
  /** Si cobra y debe la cuota el mismo mes, la cuota se descuenta del payout. */
  deductPayInFromPayout: boolean;
}

export interface PaymentSettingsPort {
  /** Las del usuario, o los valores por defecto si nunca las cambió. */
  get(userId: string): Promise<PaymentSettings>;
  save(userId: string, settings: PaymentSettings): Promise<void>;
}
