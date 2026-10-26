import type { SupportedLanguage } from '@/domain/i18n/Language';

import en from './locales/en.json';
import es from './locales/es.json';

export type TranslationResource = typeof es;

interface LanguageCatalogEntry extends SupportedLanguage {
  /** Nombre del idioma en su propio idioma, tal como se muestra en el selector. */
  nativeName: string;
  resources: TranslationResource;
}

/**
 * Catálogo de idiomas. Para agregar uno:
 * 1. Crear `locales/<código>.json` con las mismas claves que `es.json` (lo valida un test).
 * 2. Registrarlo aquí.
 * 3. Añadir el código a `supportedLocales` del plugin expo-localization en app.json.
 */
export const LANGUAGE_CATALOG: readonly LanguageCatalogEntry[] = [
  { code: 'es', nativeName: 'Español', direction: 'ltr', resources: es },
  { code: 'en', nativeName: 'English', direction: 'ltr', resources: en },
];

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = LANGUAGE_CATALOG.map(
  ({ code, direction }) => ({ code, direction }),
);
