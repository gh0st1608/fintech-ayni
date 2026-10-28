import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChangeLanguageResult } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { useContainer } from '@/presentation/providers/ContainerProvider';

import { LANGUAGE_CATALOG } from './languages';

/**
 * Idioma activo y cambio en caliente: persiste la preferencia, actualiza los textos y,
 * sin esperar, la sincroniza con el perfil del backend.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { changeLanguage, syncLanguagePreference } = useContainer().i18n;

  const change = useCallback(
    async (languageCode: string): Promise<ChangeLanguageResult> => {
      const result = await changeLanguage.execute(languageCode);
      await i18n.changeLanguage(languageCode);
      void syncLanguagePreference.execute(languageCode);
      return result;
    },
    [changeLanguage, syncLanguagePreference, i18n],
  );

  return { language: i18n.language, languages: LANGUAGE_CATALOG, changeLanguage: change };
}

/** Reintenta, una vez por sesión, la sincronización del idioma que quedó pendiente. */
export function useRetryPendingLanguageSync() {
  const { syncLanguagePreference } = useContainer().i18n;
  useEffect(() => {
    void syncLanguagePreference.retryPending();
  }, [syncLanguagePreference]);
}
