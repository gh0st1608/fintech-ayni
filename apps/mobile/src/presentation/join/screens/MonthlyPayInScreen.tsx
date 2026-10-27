import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Paso 2 de 4, "Monthly Pay-in": se implementa en COPAYNI-29. */
export function MonthlyPayInScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('join.monthlyPayIn.title')} />;
}
