import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Circle, SlotTakenError } from '../entities/circle';
import { type CircleTerms } from '../value-objects/circle-terms';
import { type SlotPricing, type SlotQuote, VacancyClosedError } from './slot-pricing';

/**
 * Mes del círculo (0 = el primero) desde el que un miembro nuevo toma hoy la vacante `position`
 * (COPAYNI-59, pending-scope §3.1, R17). La vacante se ofrece hasta el día anterior al vencimiento
 * de cada mes: antes, quien la toma paga la cuota de ese mes; desde el vencimiento, empieza el mes
 * siguiente y el fondo cubre el mes en curso.
 *
 * `null` si hoy ya no se puede tomar: el círculo no empezó, o ese mes sería posterior a su mes de
 * cobro (el pozo de ese mes ya volvió o vuelve al fondo).
 */
export function vacancyJoinMonth(
  terms: CircleTerms,
  position: number,
  today: LocalDate,
  dueDay: number,
): number | null {
  const month = terms.startsOn.monthsUntil(today.period);
  if (month < 0) return null;
  const beforeDue = LocalDate.of(today.period, dueDay).isAfter(today);
  const joinMonth = beforeDue ? month : month + 1;
  return joinMonth >= 1 && joinMonth < position ? joinMonth : null;
}

export interface OpenVacancy {
  position: number;
  /** Mes del círculo desde el que la toma quien se una hoy. */
  joinMonth: number;
}

/** Vacantes del círculo en curso que todavía se pueden tomar hoy; ninguna si no empezó. */
export function openVacancies(circle: Circle, today: LocalDate, dueDay: number): OpenVacancy[] {
  if (!circle.isRunning()) return [];
  return circle.availablePositions().flatMap((position) => {
    const joinMonth = vacancyJoinMonth(circle.terms, position, today, dueDay);
    return joinMonth === null ? [] : [{ position, joinMonth }];
  });
}

/**
 * Precio del slot para unirse hoy: el normal en un círculo que no empezó, o el de la vacante con
 * su puesta al día en uno en curso. Rechaza un turno ocupado (SLOT_TAKEN) y una vacante cuyo
 * plazo pasó (VACANCY_CLOSED).
 */
export function joinQuote(
  pricing: SlotPricing,
  circle: Circle,
  position: number,
  today: LocalDate,
  dueDay: number,
): SlotQuote {
  if (!circle.isRunning()) return pricing.quote(circle.terms, position);
  if (!circle.availablePositions().includes(position)) throw new SlotTakenError();
  const joinMonth = vacancyJoinMonth(circle.terms, position, today, dueDay);
  if (joinMonth === null) throw new VacancyClosedError();
  return pricing.replacementQuote(circle.terms, position, joinMonth);
}
