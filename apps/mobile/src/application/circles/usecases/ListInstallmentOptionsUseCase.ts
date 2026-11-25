import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Cadence } from '@/domain/circles/MyCircleDetail';
import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Cuotas posibles para el payout elegido, de menor a mayor duración. La app no las calcula: el
 * servidor devuelve solo las combinaciones que existen para ese monto (COPAYNI-125).
 */
export class ListInstallmentOptionsUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  async execute(
    payout: Money,
    cadence?: Cadence,
    signal?: AbortSignal,
  ): Promise<InstallmentOption[]> {
    const options = await this.repository.listInstallmentOptions(payout, cadence, signal);
    return [...options].sort((a, b) => a.turns - b.turns);
  }
}
