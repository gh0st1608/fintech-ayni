import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../shared/domain/value-objects/local-date';
import { ValidationError } from '../../../shared/errors/app-error';
import { type Notification } from '../domain/notification';
import {
  NOTIFICATION_SETTINGS,
  NOTIFICATIONS,
  type NotificationSettings,
  type NotificationsFilter,
  type NotificationsPort,
} from './notifications.ports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tope de ids por llamada a "marcar como leídas". */
const MAX_IDS = 100;

/**
 * Genera las notificaciones que falten (COPAYNI-84). La tarea diaria la corre para todas las
 * personas (así los recordatorios de vencimiento existen aunque nadie abra la app, para el push de
 * COPAYNI-85) y la bandeja la corre para la persona antes de leer, para que vea lo último.
 */
@Injectable()
export class SyncNotificationsUseCase {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationsPort,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(userId?: string): Promise<number> {
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone).toString();
    const created = await this.notifications.project({
      userId,
      today,
      dueSoonDays: this.settings.dueSoonDays,
    });
    if (!userId) this.logger.log({ event: 'notifications.synced', created, today });
    return created;
  }
}

/** `GET /v1/me/notifications`: la bandeja de la persona, con el contador de no leídas. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationsPort,
    @Inject(SyncNotificationsUseCase) private readonly sync: SyncNotificationsUseCase,
  ) {}

  async execute(
    userId: string,
    filter: NotificationsFilter,
  ): Promise<{ items: Notification[]; nextCursor: string | null; unread: number }> {
    await this.sync.execute(userId);
    const [page, unread] = await Promise.all([
      this.notifications.list(userId, filter),
      this.notifications.unreadCount(userId),
    ]);
    return { ...page, unread };
  }
}

/** `GET /v1/me/notifications/unread-count`: el punto de la campana. */
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationsPort,
    @Inject(SyncNotificationsUseCase) private readonly sync: SyncNotificationsUseCase,
  ) {}

  async execute(userId: string): Promise<number> {
    await this.sync.execute(userId);
    return this.notifications.unreadCount(userId);
  }
}

/** `POST /v1/me/notifications/read`: marca las indicadas, o todas si no se indican. */
@Injectable()
export class MarkNotificationsReadUseCase {
  constructor(
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(userId: string, ids: readonly string[] | null): Promise<{ unread: number }> {
    if (
      ids !== null &&
      (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => UUID.test(id)))
    ) {
      throw new ValidationError('Indica hasta 100 notificaciones válidas', { ids: 'invalid' });
    }
    await this.notifications.markRead(userId, ids, this.clock.now());
    return { unread: await this.notifications.unreadCount(userId) };
  }
}
