import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/presentation/shared/components/ComingSoon';

/** Confirmación de la unión: se implementa con COPAYNI-31 (sin diseño, pending-scope D2). */
export function JoinConfirmScreen() {
  const { t } = useTranslation();
  return <ComingSoon title={t('join.confirm.title')} />;
}
