import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Paso 4 de 4, "Payout Method": se implementa con COPAYNI-37 y la confirmación (COPAYNI-31). */
export function PayoutMethodScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('join.payoutMethod.title')} />;
}
