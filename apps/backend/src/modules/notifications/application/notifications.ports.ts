import { type Notification, type NotificationCategory } from '../domain/notification';

export const NOTIFICATIONS = Symbol('NOTIFICATIONS');
export const NOTIFICATION_SETTINGS = Symbol('NOTIFICATION_SETTINGS');

export interface NotificationSettings {
  /** Días antes del vencimiento en que se avisa (además del mismo día). */
  readonly dueSoonDays: number;
  /** Zona IANA que define "hoy" para los vencimientos. */
  readonly timeZone: string;
}

export interface NotificationsFilter {
  category?: NotificationCategory;
  limit: number;
  cursor: string | null;
}

/**
 * Bandeja de notificaciones. `project` deriva las notificaciones de los hechos ya guardados
 * (cuotas, pagos, pozos, documentos y juntas): es idempotente por la clave única de cada una.
 */
export interface NotificationsPort {
  /** Genera las que falten; `userId` limita a una persona. Devuelve cuántas creó. */
  project(scope: { userId?: string; today: string; dueSoonDays: number }): Promise<number>;
  list(
    userId: string,
    filter: NotificationsFilter,
  ): Promise<{ items: Notification[]; nextCursor: string | null }>;
  unreadCount(userId: string): Promise<number>;
  /** Marca como leídas las indicadas (o todas, sin ids). Solo toca las de la persona. */
  markRead(userId: string, ids: readonly string[] | null, at: Date): Promise<number>;
}
