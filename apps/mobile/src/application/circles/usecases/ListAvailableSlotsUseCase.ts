import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { SLOT_TYPES, type SlotGroup, type SlotsQuote } from '@/domain/circles/value-objects/Slot';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Los grupos de slots y las condiciones de la junta que los ofrece. */
export interface AvailableSlots {
  groups: SlotGroup[];
  quote: SlotsQuote;
}

/**
 * Slots agrupados por tipo de turno, siempre los tres grupos y en orden de cobro, con las
 * condiciones reales de la junta: su frecuencia, su duración y la fecha en que termina
 * (COPAYNI-116). Con `circleId`, los del círculo recomendado (una vacante, COPAYNI-59).
 */
export class ListAvailableSlotsUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  async execute(
    payout: Money,
    option: InstallmentOption,
    signal?: AbortSignal,
    circleId?: string | null,
  ): Promise<AvailableSlots> {
    const quote = await this.repository.listSlots({
      payout,
      turns: option.turns,
      cadence: option.cadence,
      signal,
      circleId,
    });
    const ordered = [...quote.slots].sort((a, b) => a.position - b.position);
    return {
      quote,
      groups: SLOT_TYPES.map((type) => ({
        type,
        slots: ordered.filter((slot) => slot.type === type),
      })),
    };
  }
}
