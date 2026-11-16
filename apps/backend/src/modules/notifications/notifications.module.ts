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
import {
  NOTIFICATION_PREFERENCES,
  PUSH_DEVICES,
  PUSH_SENDER,
  PUSH_SETTINGS,
  type PushSenderPort,
  type PushSettings,
} from './application/push.ports';
import {
  GetNotificationPreferencesUseCase,
  RegisterPushDeviceUseCase,
  SaveNotificationPreferencesUseCase,
  SendPendingPushUseCase,
  UnregisterPushDeviceUseCase,
} from './application/push.use-cases';
import { ExpoPushSender, FakePushSender } from './infrastructure/expo-push-sender';
import { SqlNotificationsRepository } from './infrastructure/sql-notifications.repository';
import {
  SqlNotificationPreferencesRepository,
  SqlPushDevicesRepository,
} from './infrastructure/sql-push-devices.repository';
import {
  NotificationPreferencesController,
  PushDevicesController,
} from './presentation/push.controller';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Bandeja de notificaciones (COPAYNI-84) y su aviso en el celular (COPAYNI-85). Exporta la
 * sincronización y el envío para la tarea diaria, que genera los recordatorios de vencimiento y
 * los manda aunque nadie abra la app.
 */
@Module({
  controllers: [NotificationsController, PushDevicesController, NotificationPreferencesController],
  providers: [
    SyncNotificationsUseCase,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationsReadUseCase,
    RegisterPushDeviceUseCase,
    UnregisterPushDeviceUseCase,
    GetNotificationPreferencesUseCase,
    SaveNotificationPreferencesUseCase,
    SendPendingPushUseCase,
    { provide: NOTIFICATIONS, useClass: SqlNotificationsRepository },
    { provide: PUSH_DEVICES, useClass: SqlPushDevicesRepository },
    { provide: NOTIFICATION_PREFERENCES, useClass: SqlNotificationPreferencesRepository },
    {
      provide: NOTIFICATION_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): NotificationSettings => ({
        dueSoonDays: config.get('NOTIFICATION_DUE_SOON_DAYS', { infer: true }),
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
      }),
    },
    {
      provide: PUSH_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): PushSettings => ({
        maxAgeHours: config.get('PUSH_MAX_AGE_HOURS', { infer: true }),
        batchSize: config.get('PUSH_BATCH_SIZE', { infer: true }),
        maxAttempts: config.get('PUSH_MAX_ATTEMPTS', { infer: true }),
      }),
    },
    {
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): PushSenderPort =>
        config.get('PUSH_PROVIDER', { infer: true }) === 'expo'
          ? new ExpoPushSender({
              apiUrl: config.get('EXPO_PUSH_API_URL', { infer: true }),
              accessToken: config.get('EXPO_ACCESS_TOKEN', { infer: true }),
              timeoutMs: config.get('PUSH_TIMEOUT_MS', { infer: true }),
            })
          : new FakePushSender(),
    },
  ],
  exports: [SyncNotificationsUseCase, SendPendingPushUseCase],
})
export class NotificationsModule {}
