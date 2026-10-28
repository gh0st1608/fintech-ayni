import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import { Period } from '../../../../shared/domain/value-objects/period';
import { ValidationError } from '../../../../shared/errors/app-error';
import { installmentOptions } from '../../domain/services/installment-options';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { CircleTerms } from '../../domain/value-objects/circle-terms';
import { CIRCLE_REPOSITORY, type CircleRepositoryPort } from '../ports/circle-repository.port';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import { PayoutNotAllowedError } from './get-installment-options.use-case';

export const CIRCLE_ASSIGNMENT = Symbol('CIRCLE_ASSIGNMENT');
export const SLOT_PRICING = Symbol('SLOT_PRICING');

/**
 * Regla provisional para elegir el círculo (pending-scope R2), desde la configuración.
 * - `fill_oldest`: el círculo abierto más antiguo con esas condiciones, que todavía no empezó y
 *   donde el usuario no es miembro. Completa círculos antes de abrir otros, así empiezan antes.
 *   Si no hay, uno nuevo.
 * - `always_new`: siempre uno nuevo.
 */
export interface CircleAssignmentSettings {
  readonly strategy: 'fill_oldest' | 'always_new';
  /** Un círculo nuevo empieza este número de meses después del mes actual. */
  readonly startOffsetMonths: number;
  /** Zona horaria IANA que define el mes actual. */
  readonly timeZone: string;
}

export interface AvailableSlot extends SlotQuote {
  available: boolean;
}

export interface AvailableSlotsResult {
  /** `null`: círculo nuevo, que se crea al unirse el primer miembro (COPAYNI-31). */
  circleId: string | null;
  terms: CircleTerms;
  slots: AvailableSlot[];
}

/** Slots del círculo que se le ofrece al usuario para ese payout y esa duración (COPAYNI-30). */
@Injectable()
export class GetAvailableSlotsUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY) private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_ASSIGNMENT) private readonly assignment: CircleAssignmentSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    payoutAmount: number,
    months: number,
  ): Promise<AvailableSlotsResult> {
    const joinConfig = await this.joinConfigs.getForUser(principal.userId);
    const payout = Money.of(payoutAmount, joinConfig.payoutRange.currency);
    if (!joinConfig.allowsPayout(payout)) throw new PayoutNotAllowedError();
    const offered = installmentOptions(payout, joinConfig.durationOptions);
    if (!offered.some((option) => option.months === months)) {
      throw new ValidationError('La duración no es una opción para ese payout', {
        months: 'not_offered',
      });
    }

    const currentPeriod = Period.fromDate(this.clock.now(), this.assignment.timeZone);
    const circle =
      this.assignment.strategy === 'fill_oldest'
        ? await this.circles.findOldestJoinable({
            payout,
            months,
            startsAfter: currentPeriod,
            userId: principal.userId,
          })
        : null;
    const terms =
      circle?.terms ??
      CircleTerms.create({
        payout,
        months,
        startsOn: currentPeriod.addMonths(this.assignment.startOffsetMonths),
      });

    return {
      circleId: circle?.id ?? null,
      terms,
      slots: this.pricing.quoteAll(terms).map((quote) => ({
        ...quote,
        available: !circle?.isTaken(quote.position),
      })),
    };
  }
}
