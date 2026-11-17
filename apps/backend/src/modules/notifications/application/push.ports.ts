import {
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from '../domain/notification';
import { type NotificationPreferences } from '../domain/notification-preferences';
import {
  type DeviceDisabledReason,
  type DevicePlatform,
  type PushDevice,
} from '../domain/push-device';
import { type PushLanguage, type PushMessage } from '../domain/push-message';

export const PUSH_DEVICES = Symbol('PUSH_DEVICES');
export const NOTIFICATION_PREFERENCES = Symbol('NOTIFICATION_PREFERENCES');
export const PUSH_SENDER = Symbol('PUSH_SENDER');
export const PUSH_SETTINGS = Symbol('PUSH_SETTINGS');

export interface PushSettings {
  /**
   * Cuánto tiempo después de crearse sigue valiendo la pena avisar. Un aviso de ayer ya no
   * interrumpe a nadie: se marca como enviado sin mandarlo.
   */
  readonly maxAgeHours: number;
  /** Notificaciones por tanda, para no pasarse de los límites del proveedor. */
  readonly batchSize: number;
  /**
   * Tandas como máximo en una corrida. La corrida sigue pidiendo tandas hasta vaciar la cola:
   * sin esto, una corrida diaria entregaría solo `batchSize` avisos y el resto moriría de viejo
   * (`maxAgeHours`) antes de la siguiente. El tope evita dar vueltas si nada avanza.
   */
  readonly maxBatches: number;
  /** Intentos antes de rendirse con una notificación. */
  readonly maxAttempts: number;
}

export interface PushDevicesPort {
  /**
   * Guarda el dispositivo de la persona. Si el token ya existía (la app se reinstala o alguien
   * más inicia sesión en el mismo celular), cambia de dueño y vuelve a quedar activo.
   */
  register(props: { userId: string; token: string; platform: DevicePlatform }): Promise<PushDevice>;
  /** Los dispositivos a los que hay que enviar; los deshabilitados no se incluyen. */
  activeOf(userId: string): Promise<PushDevice[]>;
  /** Apaga un token. `signed_out` lo pide la app al cerrar sesión; el resto, el proveedor. */
  disable(token: string, reason: DeviceDisabledReason, at: Date): Promise<boolean>;
}

export interface NotificationPreferencesPort {
  of(userId: string): Promise<NotificationPreferences>;
  save(userId: string, preferences: NotificationPreferences, at: Date): Promise<void>;
}

/** Una notificación pendiente de enviar, con lo que hace falta para escribir el aviso. */
export interface PendingPush {
  notificationId: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  data: NotificationData;
  createdAt: Date;
  language: PushLanguage;
}

/** Resultado de un envío; `unregistered` significa que ese token ya no existe. */
export interface PushResult {
  token: string;
  status: 'sent' | 'unregistered' | 'failed';
  /** Motivo técnico del fallo, para el log; nunca se le muestra a la persona. */
  reason?: string;
}

/**
 * Envío al proveedor de push (T7, propuesto: Expo Push Service). `fake` solo registra, para
 * desarrollo y pruebas.
 *
 * **El resultado es posicional:** `result[i]` corresponde a `messages[i]`. Un mismo dispositivo
 * puede recibir varios avisos en la misma tanda, así que el token no alcanza para identificar de
 * qué envío habla cada resultado.
 */
export interface PushSenderPort {
  send(
    messages: readonly { device: PushDevice; message: PushMessage }[],
  ): Promise<readonly PushResult[]>;
}
