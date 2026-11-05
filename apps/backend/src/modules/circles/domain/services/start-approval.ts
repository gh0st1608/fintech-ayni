import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../shared/domain/value-objects/money';
import { CircleTerms, MIN_CIRCLE_MONTHS } from '../value-objects/circle-terms';

/** Respuesta de un miembro a la propuesta de reducir el círculo (COPAYNI-62). */
export const START_DECISIONS = ['accepted', 'withdrawn'] as const;
export type StartDecision = (typeof START_DECISIONS)[number];

/** Propuesta vigente: las condiciones reducidas, el plazo y lo que respondió cada miembro. */
export interface StartApproval {
  readonly terms: CircleTerms;
  readonly respondBy: LocalDate;
  readonly decisions: ReadonlyMap<string, StartDecision>;
}

export type StartOutcome =
  /** Faltan respuestas y el plazo sigue abierto. */
  | { readonly status: 'wait' }
  /** Todos los que siguen aceptaron estas condiciones. */
  | { readonly status: 'start' }
  /** Alguien salió: los demás deben aprobar las condiciones nuevas. */
  | { readonly status: 'reopen'; readonly staying: readonly string[] }
  | { readonly status: 'cancel' };

/**
 * Condiciones de un círculo reducido a `members` integrantes (pending-scope R2, supuesto del
 * ticket): se mantiene la cuota base y baja el pozo. `null` si no alcanzan para un círculo.
 */
export function reducedTerms(terms: CircleTerms, members: number): CircleTerms | null {
  if (members < MIN_CIRCLE_MONTHS) return null;
  return CircleTerms.create({
    payout: Money.of(terms.baseInstallment.amount * members, terms.currency),
    months: members,
    startsOn: terms.startsOn,
  });
}

/** Turno nuevo de cada miembro: el mismo orden relativo, sin huecos. */
export function newPositions<T extends { userId: string; position: number }>(
  members: readonly T[],
): Map<string, number> {
  const ordered = [...members].sort((a, b) => a.position - b.position);
  return new Map(ordered.map(({ userId }, index) => [userId, index + 1]));
}

/**
 * Decide qué pasa con la propuesta. Quien no respondió a tiempo se cuenta como retirado. Solo se
 * empieza si todos los que siguen aceptaron estas condiciones: si alguien salió, la cuota, el pozo
 * y los turnos cambian, y los demás vuelven a decidir.
 */
export function resolveStart(
  approval: StartApproval,
  memberIds: readonly string[],
  today: LocalDate,
): StartOutcome {
  const pending = memberIds.filter((userId) => !approval.decisions.has(userId));
  if (pending.length > 0 && !approval.respondBy.isBefore(today)) return { status: 'wait' };
  const staying = memberIds.filter((userId) => approval.decisions.get(userId) === 'accepted');
  if (staying.length === memberIds.length) return { status: 'start' };
  if (staying.length < MIN_CIRCLE_MONTHS) return { status: 'cancel' };
  return { status: 'reopen', staying };
}
