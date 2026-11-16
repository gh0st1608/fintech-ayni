import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  type PermissionStatus,
} from 'expo-notifications';
import { Platform } from 'react-native';

import type { PushNotifierPort } from '@/domain/notifications/PushPorts';
import type { DevicePlatform, PushPermission } from '@/domain/notifications/PushRegistration';

/** El canal que usa el backend al enviar (`channelId: 'default'`); Android lo exige. */
export const ANDROID_CHANNEL_ID = 'default';

function toPermission(status: PermissionStatus): PushPermission {
  if (status === 'granted') return 'granted';
  return status === 'undetermined' ? 'undetermined' : 'denied';
}

/** El id del proyecto de EAS, de donde la documentación de Expo indica tomarlo. */
function projectId(): string | null {
  const fromConfig = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig;
  return fromConfig?.projectId ?? fromEas?.projectId ?? null;
}

/**
 * El celular con `expo-notifications` (COPAYNI-85). Necesita un **development build**: en Expo Go
 * no hay módulo nativo, y sin el proyecto de EAS no se puede pedir el token. En ambos casos el
 * puerto responde que no se puede registrar, en vez de romper la app.
 */
export class ExpoPushNotifier implements PushNotifierPort {
  /** Un emulador sin servicios de Google no recibe avisos; tampoco la web. */
  isSupported(): Promise<boolean> {
    return Promise.resolve(Device.isDevice && Platform.OS !== 'web');
  }

  async permission(): Promise<PushPermission> {
    const { status } = await getPermissionsAsync();
    return toPermission(status);
  }

  async requestPermission(): Promise<PushPermission> {
    const { status } = await requestPermissionsAsync();
    return toPermission(status);
  }

  async token(): Promise<string | null> {
    const id = projectId();
    // Sin proyecto de EAS, `getExpoPushTokenAsync` falla: no hay a quién pedirle el token.
    if (!id) return null;
    try {
      const { data } = await getExpoPushTokenAsync({ projectId: id });
      return data;
    } catch {
      return null;
    }
  }

  platform(): DevicePlatform {
    return Platform.OS === 'ios' ? 'ios' : 'android';
  }

  onNotificationTap(handler: () => void): () => void {
    const subscription = addNotificationResponseReceivedListener(() => handler());
    return () => {
      // Sin módulo nativo (Expo Go o las pruebas) la suscripción puede no traer `remove`: dar de
      // baja algo que nunca se registró no debe tumbar la pantalla al desmontarse.
      try {
        subscription.remove();
      } catch {
        /* nada que dar de baja */
      }
    };
  }

  async prepare(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Avisos de Ayni',
      importance: AndroidImportance.HIGH,
    });
  }
}
