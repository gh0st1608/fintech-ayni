import type { PayoutMethods, PayoutMethodType } from '../value-objects/PayoutMethod';

/** Métodos de cobro del usuario (GET y PUT /v1/me/payout-method, docs/api/payouts.md). */
export interface PayoutMethodRepositoryPort {
  list(signal?: AbortSignal): Promise<PayoutMethods>;
  /** Guarda el método; devuelve el catálogo con el nuevo `selected`. */
  select(type: PayoutMethodType): Promise<PayoutMethods>;
}
