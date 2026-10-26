import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Home — se implementa en COPAYNI-25. */
export default function HomeScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('tabs.home')} />;
}
