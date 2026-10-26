import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Mis círculos — se implementa en COPAYNI-26. */
export default function CirclesScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('tabs.circles')} />;
}
