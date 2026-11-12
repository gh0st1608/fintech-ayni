import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import {
  NOTIFICATION_SETTINGS,
  NOTIFICATIONS,
  type NotificationSettings,
} from './application/notifications.ports';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  SyncNotificationsUseCase,
} from './application/notifications.use-cases';
import { SqlNotificationsRepository } from './infrastructure/sql-notifications.repository';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Bandeja de notificaciones (COPAYNI-84). Exporta la sincronización para la tarea diaria, que
 * genera los recordatorios de vencimiento aunque nadie abra la app.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    SyncNotificationsUseCase,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationsReadUseCase,
    { provide: NOTIFICATIONS, useClass: SqlNotificationsRepository },
    {
      provide: NOTIFICATION_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): NotificationSettings => ({
        dueSoonDays: config.get('NOTIFICATION_DUE_SOON_DAYS', { infer: true }),
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
      }),
    },
  ],
  exports: [SyncNotificationsUseCase],
})
export class NotificationsModule {}
