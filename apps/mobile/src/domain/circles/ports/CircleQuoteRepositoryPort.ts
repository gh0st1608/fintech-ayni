import type { Money } from '@/domain/shared/value-objects/Money';

import type { RecommendedCircle } from '../RecommendedCircle';
import type { InstallmentOption } from '../value-objects/InstallmentOption';
import type { Slot } from '../value-objects/Slot';

/**
 * Descubrir y cotizar un Game'ya: recomendados (COPAYNI-25), cuotas por duración (COPAYNI-29) y
 * slots (COPAYNI-30).
 */
export interface CircleQuoteRepositoryPort {
  listInstallmentOptions(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]>;
  /** Slots de un círculo con ese payout y esa duración, ocupados incluidos. */
  listSlots(payout: Money, months: number, signal?: AbortSignal): Promise<Slot[]>;
  /** Círculos abiertos que se le recomiendan al usuario; vacío si no hay. */
  listRecommended(signal?: AbortSignal): Promise<RecommendedCircle[]>;
}
