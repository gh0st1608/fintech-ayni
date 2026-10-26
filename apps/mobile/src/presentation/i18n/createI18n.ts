import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { LANGUAGE_CATALOG } from './languages';

const resources = Object.fromEntries(
  LANGUAGE_CATALOG.map(({ code, resources: translation }) => [code, { translation }]),
);

/** Crea una instancia aislada de i18next con los recursos incrustados (sin carga remota). */
export async function createI18n(language: string, fallbackLanguage: string): Promise<i18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: fallbackLanguage,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
