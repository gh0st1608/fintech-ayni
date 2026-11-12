import type { SavingCatalog, SavingQuote } from '../SavingPlan';
import type { SavingSubscription, SubscribeInput } from '../SavingSubscription';

/** Programa de ahorro (docs/api/savings.md). */
export interface SavingPlanRepositoryPort {
  /** GET /savings/plans */
  list(signal?: AbortSignal): Promise<SavingCatalog>;
  /** GET /savings/plans/:id/quote?months= */
  quote(planId: string, months: number, signal?: AbortSignal): Promise<SavingQuote>;
  /**
   * POST /savings/subscriptions: suscribe y cobra el primer aporte. Un cobro rechazado falla con
   * `SAVING_PAYMENT_REJECTED`; repetir con la misma clave no cobra de nuevo.
   */
  subscribe(input: SubscribeInput, idempotencyKey: string): Promise<SavingSubscription>;
  /** GET /me/savings */
  mine(signal?: AbortSignal): Promise<SavingSubscription[]>;
  /** POST /me/savings/:id/contributions/pay: paga el aporte vencido (COPAYNI-93). */
  payContribution(
    subscriptionId: string,
    cardId: string,
    idempotencyKey: string,
  ): Promise<SavingSubscription>;
}
