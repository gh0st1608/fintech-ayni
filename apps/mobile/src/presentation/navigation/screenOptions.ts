import { useTranslation } from 'react-i18next';

/** Cabecera de "Elige un servicio" dentro del stack privado. */
export function useJoinScreenOptions() {
  const { t } = useTranslation();
  return { title: t('join.title'), headerBackButtonDisplayMode: 'minimal' } as const;
}
