/**
 * Notificaciones de la bandeja de la app (COPAYNI-84, D6). Se guardan como tipo y datos, no como
 * texto: la app arma el mensaje en el idioma de la persona. Cada una tiene una clave única por
 * persona, así un mismo hecho nunca se notifica dos veces.
 */
export const NOTIFICATION_TYPES = [
  'installment_due_soon',
  'installment_due_today',
  'payment_received',
  'payment_failed',
  'payout_turn',
  'payout_disbursed',
  'document_approved',
  'document_rejected',
  'circle_started',
  'circle_paused',
  'circle_resumed',
  'circle_member_joined',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Pestañas de la bandeja (Figma "Notificaciones"): Pagos y Círculos; los documentos van en Todas. */
export const NOTIFICATION_CATEGORIES = ['payments', 'circles', 'account'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_OF: Record<NotificationType, NotificationCategory> = {
  installment_due_soon: 'payments',
  installment_due_today: 'payments',
  payment_received: 'payments',
  payment_failed: 'payments',
  payout_turn: 'payments',
  payout_disbursed: 'payments',
  document_approved: 'account',
  document_rejected: 'account',
  circle_started: 'circles',
  circle_paused: 'circles',
  circle_resumed: 'circles',
  circle_member_joined: 'circles',
};

/** Datos para armar el mensaje y abrir la pantalla; nunca datos personales de otras personas. */
export interface NotificationData {
  circleId?: string;
  amount?: { amount: number; currency: string };
  /** `YYYY-MM-DD` del vencimiento o `YYYY-MM` del mes. */
  dueOn?: string;
  period?: string;
  /** Tipo de documento (`national_id`, `proof_of_income`, `additional`, `identity`). */
  documentType?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  data: NotificationData;
  /** Cuándo ocurrió el hecho (no cuándo se generó la notificación). */
  occurredAt: Date;
  readAt: Date | null;
}
