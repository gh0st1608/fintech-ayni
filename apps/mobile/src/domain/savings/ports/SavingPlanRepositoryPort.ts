import type { SavingCatalog, SavingQuote } from '../SavingPlan';

/**
 * Programa de ahorro (docs/api/savings.md). La suscripción espera el diseño de la confirmación
 * (D5): se agregará `subscribe(planId, months, idempotencyKey)` cuando exista el endpoint.
 */
export interface SavingPlanRepositoryPort {
  /** GET /savings/plans */
  list(signal?: AbortSignal): Promise<SavingCatalog>;
  /** GET /savings/plans/:id/quote?months= */
  quote(planId: string, months: number, signal?: AbortSignal): Promise<SavingQuote>;
}
