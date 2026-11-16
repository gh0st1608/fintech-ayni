import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './notification';

/**
 * Qué avisos quiere recibir la persona en el celular (COPAYNI-85). La bandeja de la app no se
 * filtra: estas preferencias solo deciden el envío push, así que apagar una categoría no esconde
 * lo que pasó, solo deja de interrumpir.
 *
 * Quien nunca las tocó las tiene todas activadas: el valor por defecto es recibir.
 */
export interface NotificationPreferences {
  /** Interruptor general; con `false` no se envía nada, sin importar las categorías. */
  pushEnabled: boolean;
  categories: Readonly<Record<NotificationCategory, boolean>>;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  categories: { payments: true, circles: true, account: true },
};

/** Cambio parcial: lo que no se envía se queda como estaba. */
export interface NotificationPreferencesPatch {
  pushEnabled?: boolean;
  categories?: Partial<Record<NotificationCategory, boolean>>;
}

export function applyPatch(
  current: NotificationPreferences,
  patch: NotificationPreferencesPatch,
): NotificationPreferences {
  const categories = { ...current.categories };
  for (const category of NOTIFICATION_CATEGORIES) {
    const value = patch.categories?.[category];
    if (value !== undefined) categories[category] = value;
  }
  return { pushEnabled: patch.pushEnabled ?? current.pushEnabled, categories };
}

/** Si corresponde interrumpir a la persona con esta categoría. */
export function allowsPush(
  preferences: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  return preferences.pushEnabled && preferences.categories[category];
}
