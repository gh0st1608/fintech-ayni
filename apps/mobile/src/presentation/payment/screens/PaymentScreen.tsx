import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Resumen de pagos: se implementa en COPAYNI-35. */
export function PaymentScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('tabs.payment')} />;
}
