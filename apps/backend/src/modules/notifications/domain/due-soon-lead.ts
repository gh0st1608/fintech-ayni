import { CADENCE_IDS, type CadenceId } from '../../circles/domain/value-objects/cadence';

/**
 * Antelación del recordatorio de cuota, por cadencia (COPAYNI-120).
 *
 * El recordatorio actual se manda 3 días antes del vencimiento, que es razonable en un ciclo de
 * 30 y no en uno de 7: con 3 días de antelación, el aviso de una junta semanal llega casi pegado
 * al turno anterior, y a lo largo del año son 52 recordatorios en lugar de 12. Cada cadencia
 * lleva el suyo, y con 0 no se manda recordatorio previo: queda solo el del día del vencimiento.
 *
 * Las entradas vienen de `NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE`, en formato `cadencia:días`.
 */
export function dueSoonByCadenceFrom(
  entries: readonly string[] | undefined,
): Partial<Record<CadenceId, number>> {
  const byCadence: Partial<Record<CadenceId, number>> = {};
  for (const entry of entries ?? []) {
    const [id, value] = entry.split(':');
    if (!id || value === undefined) continue;
    if (!(CADENCE_IDS as readonly string[]).includes(id)) continue;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0) continue;
    byCadence[id as CadenceId] = days;
  }
  return byCadence;
}
