import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import {
  assertSavingQuote,
  type SavingCatalog,
  type SavingQuote,
} from '@/domain/savings/SavingPlan';

export class ListSavingPlansUseCase {
  constructor(private readonly repository: SavingPlanRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<SavingCatalog> {
    return this.repository.list(signal);
  }
}

/** El backend calcula la cotización; el dominio solo comprueba que sea coherente. */
export class GetSavingQuoteUseCase {
  constructor(private readonly repository: SavingPlanRepositoryPort) {}

  async execute(planId: string, months: number, signal?: AbortSignal): Promise<SavingQuote> {
    return assertSavingQuote(await this.repository.quote(planId, months, signal));
  }
}
