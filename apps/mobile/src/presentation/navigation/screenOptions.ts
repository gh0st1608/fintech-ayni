import { useTranslation } from 'react-i18next';

import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Cabecera de "Elige un servicio" dentro del stack privado. */
export function useJoinScreenOptions() {
  const { t } = useTranslation();
  return { title: t('join.title'), headerBackButtonDisplayMode: 'minimal' } as const;
}

/** Cabecera del catálogo del design system. */
export function useCatalogScreenOptions() {
  const { t } = useTranslation();
  return { title: t('catalog.title'), headerBackButtonDisplayMode: 'minimal' } as const;
}

/** El catálogo de componentes solo existe en el ambiente dev. */
export function useIsDevEnvironment(): boolean {
  return useContainer().config.environment === 'dev';
}
