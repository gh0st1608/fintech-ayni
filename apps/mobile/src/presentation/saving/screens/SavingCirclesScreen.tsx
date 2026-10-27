import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** "Choose a Saving Circle": se implementa en COPAYNI-32. */
export function SavingCirclesScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('saving.chooseCircle.title')} />;
}
