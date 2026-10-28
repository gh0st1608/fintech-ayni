import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Cuotas posibles para el payout elegido, de menor a mayor duración. La app no las calcula. */
export class ListInstallmentOptionsUseCase {
  constructor(private readonly repository: CircleQuoteRepositoryPort) {}

  async execute(payout: Money, signal?: AbortSignal): Promise<InstallmentOption[]> {
    const options = await this.repository.listInstallmentOptions(payout, signal);
    return [...options].sort((a, b) => a.months - b.months);
  }
}
