import { useTranslation } from 'react-i18next';

import { useJoinFlow } from '../JoinFlowProvider';

/**
 * Título de la cabecera del paso 2 (COPAYNI-116).
 *
 * Depende de la cadencia del borrador y no del stack, que se arma una sola vez: en una junta
 * semanal la cabecera no puede decir «Cuota mensual». La mensual conserva el título de siempre.
 */
export function useInstallmentTitle(): string {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  return t(`join.monthlyPayIn.titles.${draft.cadence}`);
}
