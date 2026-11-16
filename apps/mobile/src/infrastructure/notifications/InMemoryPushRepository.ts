import type { PushNotifierPort, PushRepositoryPort } from '@/domain/notifications/PushPorts';
import type {
  DevicePlatform,
  NotificationPreferences,
  NotificationPreferencesPatch,
  PushPermission,
} from '@/domain/notifications/PushRegistration';

/** Dispositivos y preferencias en memoria: modo fake de desarrollo y pruebas (COPAYNI-85). */
export class InMemoryPushRepository implements PushRepositoryPort {
  readonly devices = new Map<string, DevicePlatform>();
  preferencesState: NotificationPreferences = {
    pushEnabled: true,
    categories: { payments: true, circles: true, account: true },
  };

  constructor(private readonly latencyMs = 0) {}

  async registerDevice(device: { token: string; platform: DevicePlatform }): Promise<void> {
    await this.wait();
    this.devices.set(device.token, device.platform);
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.wait();
    this.devices.delete(token);
  }

  async preferences(): Promise<NotificationPreferences> {
    await this.wait();
    return { ...this.preferencesState, categories: { ...this.preferencesState.categories } };
  }

  async savePreferences(patch: NotificationPreferencesPatch): Promise<NotificationPreferences> {
    await this.wait();
    this.preferencesState = {
      pushEnabled: patch.pushEnabled ?? this.preferencesState.pushEnabled,
      categories: { ...this.preferencesState.categories, ...patch.categories },
    };
    return this.preferences();
  }

  private wait(): Promise<void> {
    return this.latencyMs > 0
      ? new Promise((resolve) => setTimeout(resolve, this.latencyMs))
      : Promise.resolve();
  }
}

/**
 * El celular en desarrollo y pruebas: concede el permiso y devuelve un token fijo, para recorrer
 * el flujo sin un development build ni un proyecto de Expo.
 */
export class FakePushNotifier implements PushNotifierPort {
  prepared = 0;
  asked = 0;
  private readonly tapHandlers = new Set<() => void>();

  constructor(
    private state: {
      supported?: boolean;
      permission?: PushPermission;
      /** El permiso al que lleva preguntar; por defecto, concedido. */
      onRequest?: PushPermission;
      token?: string | null;
      platform?: DevicePlatform;
    } = {},
  ) {}

  isSupported(): Promise<boolean> {
    return Promise.resolve(this.state.supported ?? true);
  }

  permission(): Promise<PushPermission> {
    return Promise.resolve(this.state.permission ?? 'granted');
  }

  requestPermission(): Promise<PushPermission> {
    this.asked += 1;
    const next = this.state.onRequest ?? 'granted';
    this.state = { ...this.state, permission: next };
    return Promise.resolve(next);
  }

  token(): Promise<string | null> {
    return Promise.resolve(
      this.state.token === undefined ? 'ExponentPushToken[fake-device-0001]' : this.state.token,
    );
  }

  platform(): DevicePlatform {
    return this.state.platform ?? 'android';
  }

  prepare(): Promise<void> {
    this.prepared += 1;
    return Promise.resolve();
  }

  onNotificationTap(handler: () => void): () => void {
    this.tapHandlers.add(handler);
    return () => this.tapHandlers.delete(handler);
  }

  /** Simula que la persona toca un aviso. */
  tap(): void {
    for (const handler of this.tapHandlers) handler();
  }
}
