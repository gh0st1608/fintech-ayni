import type { NotificationCategory } from './Notification';

/** Plataformas con build de la app; en ambas el token lo emite Expo. */
export type DevicePlatform = 'ios' | 'android';

/**
 * Permiso del sistema operativo para mostrar avisos. `undetermined` es la primera vez: todavía se
 * puede preguntar. `denied` solo se cambia desde los ajustes del teléfono, no desde la app.
 */
export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** Qué pasó al intentar registrar este celular, para que la UI sepa qué decir. */
export type PushRegistrationOutcome =
  | { status: 'registered'; token: string }
  /** La persona rechazó el permiso, ahora o antes. */
  | { status: 'denied' }
  /** Sin permiso todavía y no se preguntó (no se pregunta sin que la persona lo pida). */
  | { status: 'undetermined' }
  /** El dispositivo no puede recibir avisos: emulador, o build sin configurar. */
  | { status: 'unsupported'; reason?: string };

/**
 * Preferencias de aviso (COPAYNI-85). Espejan el backend: el interruptor general y una categoría
 * por pestaña de la bandeja. Apagar una categoría deja de interrumpir, no esconde nada: la bandeja
 * sigue mostrando todo.
 */
export interface NotificationPreferences {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
}

export const PREFERENCE_CATEGORIES: readonly NotificationCategory[] = [
  'payments',
  'circles',
  'account',
];

/** Cambio parcial: lo que no se envía queda como estaba. */
export interface NotificationPreferencesPatch {
  pushEnabled?: boolean;
  categories?: Partial<Record<NotificationCategory, boolean>>;
}

/** Si con estas preferencias y este permiso llegaría algún aviso. */
export function receivesPush(
  preferences: NotificationPreferences,
  permission: PushPermission,
): boolean {
  if (permission !== 'granted' || !preferences.pushEnabled) return false;
  return PREFERENCE_CATEGORIES.some((category) => preferences.categories[category]);
}
