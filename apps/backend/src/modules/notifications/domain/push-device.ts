import { ValidationError } from '../../../shared/errors/app-error';

/** Plataformas con build de la app; el token lo emite Expo en ambas. */
export const DEVICE_PLATFORMS = ['ios', 'android'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/**
 * Token de Expo Push: `ExponentPushToken[...]` o `ExpoPushToken[...]`. Se valida el formato para
 * no guardar basura ni mandarla al proveedor, pero que el formato sea válido no prueba que la
 * instalación siga existiendo: eso lo dice el proveedor al enviar (`DeviceNotRegistered`).
 */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[\w%+/=.-]{1,150}\]$/;

export interface PushDevice {
  id: string;
  token: string;
  platform: DevicePlatform;
  lastSeenAt: Date;
}

/** Por qué se dejó de usar un token; queda guardado para poder explicar un "no me llegan". */
export const DEVICE_DISABLED_REASONS = ['unregistered', 'signed_out', 'invalid_token'] as const;
export type DeviceDisabledReason = (typeof DEVICE_DISABLED_REASONS)[number];

export function assertExpoPushToken(token: string): void {
  if (!EXPO_TOKEN.test(token)) {
    throw new ValidationError('El token del dispositivo no tiene el formato de Expo', {
      token: 'invalid',
    });
  }
}

export const isExpoPushToken = (token: string): boolean => EXPO_TOKEN.test(token);
