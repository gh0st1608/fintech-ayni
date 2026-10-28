import type { Money } from '@/domain/shared/value-objects/Money';

import type { InstallmentOption } from '../value-objects/InstallmentOption';
import type { Slot } from '../value-objects/Slot';

/** Cotización de un Game'ya: cuotas por duración (COPAYNI-29) y slots (COPAYNI-30). */
export interface CircleQuoteRepositoryPort {
  listInstallmentOptions(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]>;
  /** Slots de un círculo con ese payout y esa duración, ocupados incluidos. */
  listSlots(payout: Money, months: number, signal?: AbortSignal): Promise<Slot[]>;
}
