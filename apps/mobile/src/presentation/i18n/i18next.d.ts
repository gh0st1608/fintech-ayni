import 'i18next';

import type { TranslationResource } from './languages';

// Tipado de claves: t('clave.inexistente') falla en compilación.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: TranslationResource };
    returnNull: false;
  }
}
