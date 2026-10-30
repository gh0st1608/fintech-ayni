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
    slot: options(t('join.slot.title')),
    payoutMethod: options(t('join.payoutMethod.title')),
    confirm: options(t('join.confirm.title')),
    savingProgram: options(t('saving.chooseCircle.title')),
  };
}

/** Cabecera del catálogo del design system. */
export function useCatalogScreenOptions() {
  const { t } = useTranslation();
  return { title: t('catalog.title'), headerBackButtonDisplayMode: 'minimal' } as const;
}

/** Pantallas de la sección Payment apiladas sobre las pestañas. */
export function usePaymentScreenOptions() {
  const { t } = useTranslation();
  return {
    history: { title: t('payment.history.title'), headerBackButtonDisplayMode: 'minimal' },
    eligibility: {
      title: t('payment.eligibility.title'),
      headerBackButtonDisplayMode: 'minimal',
    },
    settings: { title: t('payment.settings.title'), headerBackButtonDisplayMode: 'minimal' },
    payoutMethod: {
      title: t('payment.settings.changePayoutMethod'),
      headerBackButtonDisplayMode: 'minimal',
    },
    cards: { title: t('payment.settings.savedCards'), headerBackButtonDisplayMode: 'minimal' },
    addCard: { title: t('payment.addCard.title'), headerBackButtonDisplayMode: 'minimal' },
    pay: { title: t('payment.pay.title'), headerBackButtonDisplayMode: 'minimal' },
  } as const;
}

/** Pantallas de Perfil apiladas sobre las pestañas. */
export function useProfileScreenOptions() {
  const { t } = useTranslation();
  return {
    personalInfo: {
      title: t('profile.personalInfo.title'),
      headerBackButtonDisplayMode: 'minimal',
    },
    contact: { title: t('profile.contact.title'), headerBackButtonDisplayMode: 'minimal' },
  } as const;
}

/** El catálogo de componentes solo existe en el ambiente dev. */
export function useIsDevEnvironment(): boolean {
  return useContainer().config.environment === 'dev';
}
