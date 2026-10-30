import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { Period } from '../../../shared/domain/value-objects/period';
import { type SavingCatalog, type SavingPlan, type SavingQuote } from '../domain/saving-catalog';

export const SAVING_CATALOG = Symbol('SAVING_CATALOG');
export const SAVING_SETTINGS = Symbol('SAVING_SETTINGS');

export interface SavingSettings {
  timeZone: string;
  /** Un plan empieza este número de meses después del mes actual (como un círculo nuevo). */
  startOffsetMonths: number;
}

/** `GET /v1/savings/plans` (COPAYNI-32). */
@Injectable()
export class ListSavingPlansUseCase {
  constructor(@Inject(SAVING_CATALOG) private readonly catalog: SavingCatalog) {}

  execute(): SavingPlan[] {
    return this.catalog.plans();
  }

  durations(): number[] {
    return this.catalog.durations;
  }
}

/** `GET /v1/savings/plans/:id/quote?months=` (COPAYNI-33): cuotas, fechas y cashback. */
@Injectable()
export class QuoteSavingPlanUseCase {
  constructor(
    @Inject(SAVING_CATALOG) private readonly catalog: SavingCatalog,
    @Inject(SAVING_SETTINGS) private readonly settings: SavingSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  execute(planId: string, months: number): SavingQuote {
    const startsOn = Period.fromDate(this.clock.now(), this.settings.timeZone).addMonths(
      this.settings.startOffsetMonths,
    );
    return this.catalog.quote(planId, months, startsOn);
  }
}
