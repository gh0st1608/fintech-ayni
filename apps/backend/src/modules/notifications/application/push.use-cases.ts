import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import {
  applyPatch,
  allowsPush,
  type NotificationPreferences,
  type NotificationPreferencesPatch,
} from '../domain/notification-preferences';
import { assertExpoPushToken, type DevicePlatform, type PushDevice } from '../domain/push-device';
import { buildPushMessage, type PushMessage } from '../domain/push-message';
import { NOTIFICATIONS, type NotificationsPort } from './notifications.ports';
import {
  NOTIFICATION_PREFERENCES,
  PUSH_DEVICES,
  PUSH_SENDER,
  PUSH_SETTINGS,
  type NotificationPreferencesPort,
  type PushDevicesPort,
  type PushSenderPort,
  type PushSettings,
} from './push.ports';

/** `POST /v1/me/devices`: la app registra el token de Expo tras aceptar los permisos. */
@Injectable()
export class RegisterPushDeviceUseCase {
  constructor(@Inject(PUSH_DEVICES) private readonly devices: PushDevicesPort) {}

  // `async` a propósito: así un token con mal formato rechaza la promesa en vez de lanzar de
  // forma sincrónica, que es lo que espera quien llama al caso de uso.
  async execute(props: {
    userId: string;
    token: string;
    platform: DevicePlatform;
  }): Promise<PushDevice> {
    assertExpoPushToken(props.token);
    return this.devices.register(props);
  }
}

/** `DELETE /v1/me/devices/:token`: al cerrar sesión, ese celular deja de recibir avisos. */
@Injectable()
export class UnregisterPushDeviceUseCase {
  constructor(
    @Inject(PUSH_DEVICES) private readonly devices: PushDevicesPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(token: string): Promise<void> {
    assertExpoPushToken(token);
    // No se distingue si existía: quien cierra sesión no necesita saber si el token estaba.
    await this.devices.disable(token, 'signed_out', this.clock.now());
  }
}

/** `GET /v1/me/notification-preferences`. */
@Injectable()
export class GetNotificationPreferencesUseCase {
  constructor(
    @Inject(NOTIFICATION_PREFERENCES) private readonly preferences: NotificationPreferencesPort,
  ) {}

  execute(userId: string): Promise<NotificationPreferences> {
    return this.preferences.of(userId);
  }
}

/** `PUT /v1/me/notification-preferences`: cambio parcial sobre lo que ya tenía. */
@Injectable()
export class SaveNotificationPreferencesUseCase {
  constructor(
    @Inject(NOTIFICATION_PREFERENCES) private readonly preferences: NotificationPreferencesPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    userId: string,
    patch: NotificationPreferencesPatch,
  ): Promise<NotificationPreferences> {
    const updated = applyPatch(await this.preferences.of(userId), patch);
    await this.preferences.save(userId, updated, this.clock.now());
    return updated;
  }
}

export interface PushRun {
  /** Notificaciones revisadas en esta corrida. */
  considered: number;
  /** Avisos aceptados por el proveedor. */
  sent: number;
  /** No se envió porque la persona lo tiene apagado, no tiene dispositivos o ya era viejo. */
  skipped: number;
  /** Fallaron y se reintentarán, salvo que hayan agotado los intentos. */
  failed: number;
  /** Tokens que el proveedor declaró inexistentes y quedaron apagados. */
  unregistered: number;
}

/**
 * Envía al celular las notificaciones que la bandeja ya generó (COPAYNI-85). La corre la tarea
 * diaria justo después de sincronizar, así los recordatorios de vencimiento salen aunque nadie
 * abra la app.
 *
 * Reglas que hacen esto seguro de repetir:
 * - Cada notificación se marca enviada en cuanto el proveedor la acepta, así que una segunda
 *   corrida no vuelve a avisar lo mismo.
 * - Lo que la persona apagó, lo que no tiene dispositivo y lo que ya es viejo se marcan igual:
 *   no se queda nada pendiente para siempre.
 * - Un fallo del proveedor deja la notificación pendiente y suma un intento; al llegar al tope se
 *   abandona, para que una sola notificación rota no bloquee la cola.
 */
@Injectable()
export class SendPendingPushUseCase {
  private readonly logger = new Logger('Push');

  constructor(
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationsPort,
    @Inject(PUSH_DEVICES) private readonly devices: PushDevicesPort,
    @Inject(NOTIFICATION_PREFERENCES) private readonly preferences: NotificationPreferencesPort,
    @Inject(PUSH_SENDER) private readonly sender: PushSenderPort,
    @Inject(PUSH_SETTINGS) private readonly settings: PushSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<PushRun> {
    const now = this.clock.now();
    const pending = await this.notifications.pendingPush({
      limit: this.settings.batchSize,
      maxAttempts: this.settings.maxAttempts,
    });
    const run: PushRun = {
      considered: pending.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      unregistered: 0,
    };
    if (pending.length === 0) return run;

    const oldestAllowed = now.getTime() - this.settings.maxAgeHours * 3_600_000;
    const outbox: { device: PushDevice; message: PushMessage; notificationId: string }[] = [];
    const skipped: string[] = [];
    // Las preferencias y los dispositivos se piden una vez por persona, no por notificación.
    const audience = new Map<
      string,
      { devices: PushDevice[]; preferences: NotificationPreferences }
    >();

    for (const item of pending) {
      if (item.createdAt.getTime() < oldestAllowed) {
        skipped.push(item.notificationId);
        continue;
      }
      let person = audience.get(item.userId);
      if (!person) {
        const [devices, preferences] = await Promise.all([
          this.devices.activeOf(item.userId),
          this.preferences.of(item.userId),
        ]);
        person = { devices, preferences };
        audience.set(item.userId, person);
      }
      if (person.devices.length === 0 || !allowsPush(person.preferences, item.category)) {
        skipped.push(item.notificationId);
        continue;
      }
      const message = buildPushMessage(
        { id: item.notificationId, type: item.type, data: item.data },
        item.language,
      );
      for (const device of person.devices) {
        outbox.push({ device, message, notificationId: item.notificationId });
      }
    }

    if (skipped.length > 0) await this.notifications.markPushed(skipped, now);
    run.skipped = skipped.length;
    if (outbox.length === 0) return run;

    const results = await this.sender.send(outbox);
    const sent = new Set<string>();
    const failed = new Set<string>();
    const unregistered = new Set<string>();

    // El resultado es posicional: el mismo dispositivo puede llevar varios avisos en la tanda.
    outbox.forEach((entry, index) => {
      const result = results[index];
      if (result?.status === 'sent') sent.add(entry.notificationId);
      else failed.add(entry.notificationId);
      if (result?.status === 'unregistered') unregistered.add(entry.device.token);
    });
    // Basta un dispositivo para dar el aviso por entregado: no se reintenta por los demás.
    for (const id of sent) failed.delete(id);

    for (const token of unregistered) {
      if (await this.devices.disable(token, 'unregistered', now)) run.unregistered += 1;
    }

    if (sent.size > 0) await this.notifications.markPushed([...sent], now);
    if (failed.size > 0) await this.notifications.markPushAttempt([...failed]);
    run.sent = sent.size;
    run.failed = failed.size;

    this.logger.log({ event: 'push.sent', ...run });
    return run;
  }
}
