import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** "Choose a Service": se implementa en COPAYNI-27. */
export function JoinScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('join.title')} />;
}
