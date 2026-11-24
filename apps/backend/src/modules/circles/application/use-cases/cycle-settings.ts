import { type DelinquencyPolicy } from '../../domain/entities/circle-cycle';
import { type Cadence, type CadenceId } from '../../domain/value-objects/cadence';

export const CIRCLE_CYCLE = Symbol('CIRCLE_CYCLE');

export interface CircleCycleSettings {
  /** Día del mes en que vence cada cuota (pending-scope R19, provisional). */
  dueDay: number;
  timeZone: string;
  /** Gracia, cargo por mora y penalidad de devolución (COPAYNI-57) de la cadencia mensual. */
  delinquency: DelinquencyPolicy;
  /**
   * Gracia y mora de las demás cadencias (COPAYNI-111). El riesgo no es el mismo: con 3 días de
   * gracia no hay solape con la cuota siguiente ni en una junta semanal, pero sí hay 52 ocasiones
   * anuales de incurrir en mora en lugar de 12. La validación de entorno exige que toda cadencia
   * habilitada tenga la suya, así que aquí no hay que decidir nada si falta.
   */
  delinquencyByCadence?: Partial<Record<CadenceId, DelinquencyPolicy>>;
  /** Parte de las Admin Fees que va al fondo de garantía (COPAYNI-58, R16). */
  fundFeeShareBps: number;
  /** Días para responder a la propuesta de un círculo incompleto (COPAYNI-62, supuesto). */
  startApprovalDays: number;
}

/** La morosidad que rige a una junta de esa cadencia; la mensual es la de siempre. */
export function delinquencyFor(
  settings: Pick<CircleCycleSettings, 'delinquency' | 'delinquencyByCadence'>,
  cadence: Cadence,
): DelinquencyPolicy {
  return settings.delinquencyByCadence?.[cadence.id] ?? settings.delinquency;
}

/**
 * Las políticas por cadencia a partir de las listas de entorno `cadencia:valor` (COPAYNI-111).
 *
 * La penalidad de devolución no se parametriza por cadencia: es un porcentaje de lo pagado y no
 * depende de cada cuánto se paga.
 */
export function delinquencyByCadenceFrom(entries: {
  graceDays: readonly string[];
  lateFeeBps: readonly string[];
  refundPenaltyBps: number;
}): Partial<Record<CadenceId, DelinquencyPolicy>> {
  const toMap = (list: readonly string[]): Map<string, number> =>
    new Map(
      list.map((entry) => {
        const [id, value] = entry.split(':');
        return [id!, Number(value)];
      }),
    );
  const grace = toMap(entries.graceDays);
  const fees = toMap(entries.lateFeeBps);
  const byCadence: Partial<Record<CadenceId, DelinquencyPolicy>> = {};
  for (const [id, graceDays] of grace) {
    const lateFeeBps = fees.get(id);
    if (lateFeeBps === undefined) continue;
    byCadence[id as CadenceId] = {
      graceDays,
      lateFeeBps,
      refundPenaltyBps: entries.refundPenaltyBps,
    };
  }
  return byCadence;
}
