export const PAYMENT_METHOD_LOG = Symbol('PAYMENT_METHOD_LOG');

/**
 * Con qué se pagó cada cuota, enmascarado ("Visa •••• 4242", "Yape •••• 4321"), para el
 * comprobante (COPAYNI-80). Nunca guarda el número completo de la tarjeta ni del celular.
 */
export interface PaymentMethodLogPort {
  record(installmentId: string, label: string): Promise<void>;
}

const BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  master: 'Mastercard',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
};

/** "Visa •••• 4242": la marca y los 4 últimos dígitos. */
export function cardLabel(brand: string, lastFour: string): string {
  const name = BRAND_NAMES[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
  return `${name} •••• ${lastFour}`;
}

/** "Yape •••• 4321": solo los 4 últimos dígitos del celular. */
export const yapeLabel = (phone: string): string => `Yape •••• ${phone.slice(-4)}`;
