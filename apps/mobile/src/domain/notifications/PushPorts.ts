import type {
  DevicePlatform,
  NotificationPreferences,
  NotificationPreferencesPatch,
  PushPermission,
} from './PushRegistration';

/**
 * Dispositivos y preferencias en el backend (COPAYNI-85,
 * docs/api/notifications.md#aviso-en-el-celular-push-copayni-85).
 */
export interface PushRepositoryPort {
  /** Idempotente por token: repetirlo no duplica el dispositivo. */
  registerDevice(
    device: { token: string; platform: DevicePlatform },
    signal?: AbortSignal,
  ): Promise<void>;
  /** Al cerrar sesión: este celular deja de recibir avisos. */
  unregisterDevice(token: string): Promise<void>;
  preferences(signal?: AbortSignal): Promise<NotificationPreferences>;
  /** Cambio parcial; devuelve cómo quedaron. */
  savePreferences(patch: NotificationPreferencesPatch): Promise<NotificationPreferences>;
}

/**
 * El celular: permisos del sistema operativo y token del proveedor. Vive detrás de un puerto
 * porque `expo-notifications` necesita un development build y no existe en las pruebas.
 */
export interface PushNotifierPort {
  /** Si este dispositivo puede recibir avisos (un emulador sin servicios, no). */
  isSupported(): Promise<boolean>;
  permission(): Promise<PushPermission>;
  /** Pregunta al sistema operativo. Con el permiso ya denegado no vuelve a preguntar. */
  requestPermission(): Promise<PushPermission>;
  /** Token de Expo de esta instalación; `null` si no se puede obtener. */
  token(): Promise<string | null>;
  platform(): DevicePlatform;
  /** Prepara el canal de Android; en iOS no hace nada. */
  prepare(): Promise<void>;
  /**
   * Avisa cuando la persona toca un aviso, para abrir la bandeja. Devuelve la baja de la
   * suscripción.
   */
  onNotificationTap(handler: () => void): () => void;
}
