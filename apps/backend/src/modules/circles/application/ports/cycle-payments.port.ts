import {
  type CollectionOutcome,
  type Disbursement,
  type Installment,
} from '../../domain/entities/circle-cycle';

export const CONTRIBUTIONS = Symbol('CONTRIBUTIONS');
export const DISBURSEMENTS = Symbol('DISBURSEMENTS');

/**
 * Cobro de las cuotas (pay-in). El proveedor real llega con D1 y la pasarela (COPAYNI-34); hasta
 * entonces hay un adaptador falso.
 */
export interface ContributionsPort {
  /** Idempotente por `installment.id`: cobrar dos veces la misma cuota no la cobra dos veces. */
  collect(installment: Installment & { circleId: string }): Promise<CollectionOutcome>;
}

/** Pago del payout al miembro que cobra el mes. */
export interface DisbursementsPort {
  /** Idempotente por (`circleId`, `period`): un mes se paga una sola vez. */
  disburse(disbursement: Disbursement & { circleId: string }): Promise<void>;
}
