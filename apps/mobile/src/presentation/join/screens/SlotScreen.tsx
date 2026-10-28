import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Paso 3 de 4, "Slot": se implementa en COPAYNI-30. */
export function SlotScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('join.slot.title')} />;
}
