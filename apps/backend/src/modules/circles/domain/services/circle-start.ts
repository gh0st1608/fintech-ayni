import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Cadence } from '../value-objects/cadence';

/**
 * Cuándo arranca una junta nueva: `steps` pasos de su cadencia contados desde `today`
 * (COPAYNI-114).
 *
 * El desplazamiento se expresa en la unidad de la cadencia, no en meses. Un mes de espera para
 * una junta semanal no tiene sentido: la junta entera dura cuatro semanas, así que esperar un mes
 * para empezar es esperar más que lo que dura. Con `CIRCLE_START_OFFSET_MONTHS = 1`, una mensual
 * empieza el mes que viene —como hasta ahora— y una semanal, la semana que viene.
 *
 * En cadencia mensual se devuelve el **día 1** del mes que toca, que es la invariante del dominio
 * (COPAYNI-108) y la fecha de arranque de todos los círculos que existen. En las demás, el día que
 * cae por calendario, porque arrancan cualquier día.
 */
export function nextStart(today: LocalDate, cadence: Cadence, steps: number): LocalDate {
  if (cadence.isMonthly()) return LocalDate.of(today.period.addMonths(steps), 1);
  return cadence.advance(today, steps);
}
