import { useTranslation } from 'react-i18next';

import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Cabeceras del flujo de unión dentro del stack privado. */
export function useJoinScreenOptions() {
  const { t } = useTranslation();
  const options = (title: string) => ({ title, headerBackButtonDisplayMode: 'minimal' }) as const;
  return {
    chooseService: options(t('join.title')),
    payoutAmount: options(t('join.payout.title')),
    monthlyPayIn: options(t('join.monthlyPayIn.title')),
    savingProgram: options(t('saving.chooseCircle.title')),
  };
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
