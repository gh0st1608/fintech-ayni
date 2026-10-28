import type { Money } from '@/domain/shared/value-objects/Money';

import type { InstallmentOption } from '../value-objects/InstallmentOption';

/** Cotización de un Game'ya: cuotas por duración (COPAYNI-29) y, después, slots (COPAYNI-30). */
export interface CircleQuoteRepositoryPort {
  listInstallmentOptions(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]>;
}
