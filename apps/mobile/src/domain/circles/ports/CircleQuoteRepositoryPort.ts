import type { Money } from '@/domain/shared/value-objects/Money';

import type { RecommendedCircle } from '../RecommendedCircle';
import type { InstallmentOption } from '../value-objects/InstallmentOption';
import type { SlotsQuote } from '../value-objects/Slot';
import type { Cadence } from '../MyCircleDetail';

/**
 * Descubrir y cotizar un Game'ya: recomendados (COPAYNI-25), cuotas por duración (COPAYNI-29) y
 * slots (COPAYNI-30).
 */
export interface CircleQuoteRepositoryPort {
  /**
   * Combinaciones cuota × turnos para ese payout. `cadence` pide las de esa frecuencia
   * (COPAYNI-116); sin ella, las mensuales, que es lo que hacía la app antes.
   */
  listInstallmentOptions(
    payout: Money,
    cadence?: Cadence,
    signal?: AbortSignal,
  ): Promise<InstallmentOption[]>;
  /**
   * Slots de un círculo con ese payout y esos turnos, ocupados incluidos, con las condiciones
   * reales de la junta. Con `circleId`, los de ese círculo recomendado (COPAYNI-59); si no, los
   * del círculo que asigna el backend.
   */
  listSlots(props: {
    payout: Money;
    turns: number;
    cadence?: Cadence;
    signal?: AbortSignal;
    circleId?: string | null;
  }): Promise<SlotsQuote>;
  /** Círculos abiertos que se le recomiendan al usuario; vacío si no hay. */
  listRecommended(signal?: AbortSignal): Promise<RecommendedCircle[]>;
}
