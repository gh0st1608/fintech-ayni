import { type Money } from '../../../../shared/domain/value-objects/money';

export const PAY_IN_LIMIT = Symbol('PAY_IN_LIMIT');

/**
 * Límite mensual de pay-in del usuario (pending-scope R5): el PO confirmó que se calcula con el
 * ingreso mensual; la fórmula es provisional (`KycPayInLimit`).
 */
export interface PayInLimitPort {
  /** `null` si no se le restringe. */
  monthlyLimitFor(userId: string): Promise<Money | null>;
}
