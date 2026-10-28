import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { SLOT_TYPES, type SlotGroup } from '@/domain/circles/value-objects/Slot';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Slots agrupados por tipo de turno, siempre los tres grupos y en orden de cobro. */
export class ListAvailableSlotsUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  async execute(
    payout: Money,
    option: InstallmentOption,
    signal?: AbortSignal,
  ): Promise<SlotGroup[]> {
    const slots = await this.repository.listSlots(payout, option.months, signal);
    const ordered = [...slots].sort((a, b) => a.position - b.position);
    return SLOT_TYPES.map((type) => ({
      type,
      slots: ordered.filter((slot) => slot.type === type),
    }));
  }
}
