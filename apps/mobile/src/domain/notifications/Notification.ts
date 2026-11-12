import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Notificación de la bandeja (COPAYNI-84, Figma "Notificaciones" 2052:2373). El backend envía el
 * tipo y los datos; la app arma el texto en el idioma de la persona.
 */
export const NOTIFICATION_TYPES = [
  'installmentDueSoon',
  'installmentDueToday',
  'paymentReceived',
  'paymentFailed',
  'payoutTurn',
  'payoutDisbursed',
  'documentApproved',
  'documentRejected',
  'circleStarted',
  'circlePaused',
  'circleResumed',
  'circleMemberJoined',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationCategory = 'payments' | 'circles' | 'account';

/** Pestañas de la bandeja: los documentos solo aparecen en "Todas". */
export type NotificationTab = 'all' | 'payments' | 'circles';

export interface AppNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  circleId: string | null;
  amount: Money | null;
  /** `YYYY-MM-DD` del vencimiento, si aplica. */
  dueOn: string | null;
  /** `YYYY-MM` del mes, si aplica. */
  period: string | null;
  documentType: string | null;
  occurredAt: Date;
  read: boolean;
}

export interface NotificationsPage {
  items: AppNotification[];
  nextCursor: string | null;
  unread: number;
}

/** A dónde lleva tocar la notificación. */
export type NotificationTarget =
  { screen: 'circle'; circleId: string } | { screen: 'paymentHistory' } | { screen: 'documents' };

export function targetOf(notification: AppNotification): NotificationTarget {
  if (notification.category === 'account') return { screen: 'documents' };
  if (notification.category === 'payments' && notification.type !== 'payoutTurn') {
    return { screen: 'paymentHistory' };
  }
  return notification.circleId
    ? { screen: 'circle', circleId: notification.circleId }
    : { screen: 'paymentHistory' };
}
