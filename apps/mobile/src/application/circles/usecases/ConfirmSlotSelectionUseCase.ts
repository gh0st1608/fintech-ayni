import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { SlotNoLongerAvailableError, type Slot } from '@/domain/circles/value-objects/Slot';
import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Revalida el slot elegido justo antes de continuar. No lo reserva: la reserva atómica es la
 * unión al círculo (COPAYNI-31), que vuelve a comprobarlo en el backend.
 */
export class ConfirmSlotSelectionUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  async execute(
    payout: Money,
    option: InstallmentOption,
    position: number,
    signal?: AbortSignal,
  ): Promise<Slot> {
    const slots = await this.repository.listSlots(payout, option.months, signal);
    const current = slots.find((slot) => slot.position === position);
    if (!current?.available) {
      throw new SlotNoLongerAvailableError(`Slot ${position} is no longer available`);
    }
    return current;
  }
}
