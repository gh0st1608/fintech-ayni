import type { NotificationsPage, NotificationTab } from '@/domain/notifications/Notification';
import type { NotificationRepositoryPort } from '@/domain/notifications/NotificationRepositoryPort';

/** La bandeja por pestaña, de la más reciente a la más antigua (COPAYNI-84). */
export class ListNotificationsUseCase {
  constructor(private readonly repository: NotificationRepositoryPort) {}

  execute(
    filter: { tab: NotificationTab; cursor: string | null },
    signal?: AbortSignal,
  ): Promise<NotificationsPage> {
    return this.repository.list(filter, signal);
  }
}

/** No leídas, para el punto de la campana. */
export class CountUnreadNotificationsUseCase {
  constructor(private readonly repository: NotificationRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<number> {
    return this.repository.unreadCount(signal);
  }
}

/** Marca como leídas las indicadas, o todas. */
export class MarkNotificationsReadUseCase {
  constructor(private readonly repository: NotificationRepositoryPort) {}

  execute(ids: readonly string[] | null): Promise<number> {
    return this.repository.markRead(ids);
  }
}
