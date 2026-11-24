import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { type TurnSchedule } from './turn-schedule';

/** Lo que una persona se compromete a pagar en un mes calendario. */
export interface MonthlyPayIn {
  readonly period: Period;
  readonly amount: Money;
}

/**
 * Las cuotas de un slot repartidas en el mes en que vencen **de verdad** (COPAYNI-110).
 *
 * El límite de pay-in del perfil es mensual, así que para compararlo hace falta saber cuánto cae
 * en cada mes calendario, y eso lo decide el cronograma: en cadencia mensual hay una cuota por
 * mes y la cuenta es la de siempre, pero en una semanal caen cuatro o cinco en el mismo mes.
 *
 * Una cuota de cero no se cuenta: quien toma una vacante no paga los turnos anteriores a su
 * ingreso (COPAYNI-59), y un mes sin pago no es un compromiso.
 */
export function payInByMonth(
  installments: readonly Money[],
  schedule: TurnSchedule,
): MonthlyPayIn[] {
  const turns = Math.min(installments.length, schedule.turns);
  const byMonth = new Map<string, MonthlyPayIn>();
  for (let turn = 1; turn <= turns; turn += 1) {
    const amount = installments[turn - 1]!;
    if (!amount.isPositive()) continue;
    const period = schedule.dueOn(turn).period;
    const key = period.toString();
    const seen = byMonth.get(key);
    byMonth.set(key, { period, amount: seen ? seen.amount.add(amount) : amount });
  }
  return ordered(byMonth);
}

/**
 * Lo comprometido mes a mes sumando varios círculos: el límite es de la persona, no del círculo
 * (COPAYNI-110), así que unirse a uno nuevo se evalúa con lo que ya paga en los demás.
 *
 * Todas las cantidades deben venir en la misma moneda; convertirlas es cosa de quien conoce el
 * tipo de cambio (pending-scope M2).
 */
export function totalPayInByMonth(parts: readonly (readonly MonthlyPayIn[])[]): MonthlyPayIn[] {
  const byMonth = new Map<string, MonthlyPayIn>();
  for (const part of parts) {
    for (const { period, amount } of part) {
      const key = period.toString();
      const seen = byMonth.get(key);
      byMonth.set(key, { period, amount: seen ? seen.amount.add(amount) : amount });
    }
  }
  return ordered(byMonth);
}

/** El mes que excede `limit`, con lo que se pasa, o `null` si ninguno lo hace. */
export function monthOverLimit(
  payIn: readonly MonthlyPayIn[],
  limit: Money,
): { period: Period; total: Money; excess: Money } | null {
  for (const { period, amount } of payIn) {
    const excess = amount.subtract(limit);
    if (excess.isPositive()) return { period, total: amount, excess };
  }
  return null;
}

/** Del mes más temprano al más tardío: el error nombra el primer mes que se pasa. */
const ordered = (byMonth: Map<string, MonthlyPayIn>): MonthlyPayIn[] =>
  [...byMonth.values()].sort((a, b) => b.period.monthsUntil(a.period));
