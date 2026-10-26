import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChangeLanguageResult } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import { useContainer } from '@/presentation/providers/ContainerProvider';

import { LANGUAGE_CATALOG } from './languages';

/** Idioma activo y cambio en caliente: persiste la preferencia y actualiza los textos. */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { changeLanguage } = useContainer().i18n;

  const change = useCallback(
    async (languageCode: string): Promise<ChangeLanguageResult> => {
      const result = await changeLanguage.execute(languageCode);
      await i18n.changeLanguage(languageCode);
      return result;
    },
    [changeLanguage, i18n],
  );

  return { language: i18n.language, languages: LANGUAGE_CATALOG, changeLanguage: change };
}
