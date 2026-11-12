/**
 * Cuenta donde la persona recibe su pozo (COPAYNI-81). La registra el equipo de Ayni desde el
 * back-office con la constancia que envía la persona; la app solo la muestra enmascarada.
 */
export type PayoutAccountKind = 'bankAccount' | 'wallet';

export interface PayoutAccount {
  kind: PayoutAccountKind;
  /** "BCP •••• 1234": el backend nunca envía el número completo. */
  label: string;
  holderName: string;
  registeredAt: Date;
}
