import type { NotificationsPage, NotificationTab } from './Notification';

/** Bandeja de notificaciones (GET /v1/me/notifications, docs/api/notifications.md). */
export interface NotificationRepositoryPort {
  list(
    filter: { tab: NotificationTab; cursor: string | null },
    signal?: AbortSignal,
  ): Promise<NotificationsPage>;
  unreadCount(signal?: AbortSignal): Promise<number>;
  /** Sin ids marca todas. Devuelve las no leídas que quedan. */
  markRead(ids: readonly string[] | null): Promise<number>;
}
