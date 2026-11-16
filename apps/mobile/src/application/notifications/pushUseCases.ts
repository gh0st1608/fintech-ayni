import type { PushNotifierPort, PushRepositoryPort } from '@/domain/notifications/PushPorts';
import type {
  NotificationPreferences,
  NotificationPreferencesPatch,
  PushPermission,
  PushRegistrationOutcome,
} from '@/domain/notifications/PushRegistration';

/**
 * Registra este celular para recibir avisos (COPAYNI-85).
 *
 * `ask: false` es el arranque de la app: si todavía no hay permiso **no** se pregunta, porque un
 * diálogo del sistema sin contexto se rechaza y el rechazo no se puede deshacer desde la app.
 * `ask: true` es cuando la persona lo pide desde los ajustes de notificaciones.
 */
export class RegisterPushDeviceUseCase {
  constructor(
    private readonly notifier: PushNotifierPort,
    private readonly repository: PushRepositoryPort,
  ) {}

  async execute({ ask }: { ask: boolean } = { ask: false }): Promise<PushRegistrationOutcome> {
    if (!(await this.notifier.isSupported())) {
      return { status: 'unsupported', reason: 'device' };
    }
    let permission: PushPermission = await this.notifier.permission();
    if (permission === 'undetermined') {
      if (!ask) return { status: 'undetermined' };
      permission = await this.notifier.requestPermission();
    }
    if (permission !== 'granted') return { status: 'denied' };

    await this.notifier.prepare();
    const token = await this.notifier.token();
    // Sin token no hay a dónde enviar: pasa si al build le falta el proyecto de Expo.
    if (!token) return { status: 'unsupported', reason: 'token' };

    await this.repository.registerDevice({ token, platform: this.notifier.platform() });
    return { status: 'registered', token };
  }
}

/**
 * Al cerrar sesión, este celular deja de recibir los avisos de esta persona. Nunca interrumpe el
 * cierre de sesión: si falla, el backend igual apagará el token cuando el proveedor lo rechace.
 */
export class UnregisterPushDeviceUseCase {
  constructor(
    private readonly notifier: PushNotifierPort,
    private readonly repository: PushRepositoryPort,
  ) {}

  async execute(): Promise<boolean> {
    try {
      const token = await this.notifier.token();
      if (!token) return false;
      await this.repository.unregisterDevice(token);
      return true;
    } catch {
      return false;
    }
  }
}

/** Qué avisos quiere recibir la persona. */
export class GetNotificationPreferencesUseCase {
  constructor(private readonly repository: PushRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<NotificationPreferences> {
    return this.repository.preferences(signal);
  }
}

/** Cambia una preferencia; el resto queda como estaba. */
export class SaveNotificationPreferencesUseCase {
  constructor(private readonly repository: PushRepositoryPort) {}

  execute(patch: NotificationPreferencesPatch): Promise<NotificationPreferences> {
    return this.repository.savePreferences(patch);
  }
}

/**
 * Suscribe al toque en un aviso; devuelve la baja. La UI decide a dónde llevar: la app no navega
 * desde la capa de aplicación.
 */
export class ObservePushTapsUseCase {
  constructor(private readonly notifier: PushNotifierPort) {}

  execute(handler: () => void): () => void {
    return this.notifier.onNotificationTap(handler);
  }
}

/** El permiso del sistema operativo, para explicar en los ajustes por qué no llegan avisos. */
export class GetPushPermissionUseCase {
  constructor(private readonly notifier: PushNotifierPort) {}

  async execute(): Promise<PushPermission> {
    return (await this.notifier.isSupported()) ? this.notifier.permission() : 'denied';
  }
}
