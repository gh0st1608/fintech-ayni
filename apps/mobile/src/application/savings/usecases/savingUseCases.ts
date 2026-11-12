import type { SavingPlanRepositoryPort } from '@/domain/savings/ports/SavingPlanRepositoryPort';
import type { SavingSubscription, SubscribeInput } from '@/domain/savings/SavingSubscription';
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

/** Confirma el plan y paga el primer aporte (COPAYNI-79); la clave la genera la pantalla. */
export class SubscribeToSavingPlanUseCase {
  constructor(private readonly repository: SavingPlanRepositoryPort) {}

  execute(input: SubscribeInput, idempotencyKey: string): Promise<SavingSubscription> {
    return this.repository.subscribe(input, idempotencyKey);
  }
}

export class ListMySavingsUseCase {
  constructor(private readonly repository: SavingPlanRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<SavingSubscription[]> {
    return this.repository.mine(signal);
  }
}
