import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { Period } from '../../../../shared/domain/value-objects/period';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  AlreadyMemberError,
  type Circle,
  CircleAlreadyStartedError,
} from '../../domain/entities/circle';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { openVacancies } from '../../domain/services/vacancy';
import { CircleTerms } from '../../domain/value-objects/circle-terms';
import { CIRCLE_REPOSITORY, type CircleRepositoryPort } from '../ports/circle-repository.port';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { offeredPayout } from './offered-payout';

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

/**
 * Slots del círculo que se le ofrece al usuario para ese payout y esa duración (COPAYNI-30).
 * Con `circleId` (un recomendado de Home, COPAYNI-59), los de ese círculo: si está en curso, solo
 * sus vacantes abiertas están disponibles, con el precio de la puesta al día.
 */
@Injectable()
export class GetAvailableSlotsUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY) private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_ASSIGNMENT) private readonly assignment: CircleAssignmentSettings,
    @Inject(CIRCLE_CYCLE) private readonly cycle: Pick<CircleCycleSettings, 'dueDay'>,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    payoutAmount: number,
    months: number,
    circleId?: string,
  ): Promise<AvailableSlotsResult> {
    const joinConfig = await this.joinConfigs.getForUser(principal.userId);
    const payout = offeredPayout(joinConfig, payoutAmount, months);
    if (circleId !== undefined) return this.slotsOf(circleId, principal.userId, payout, months);

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

  private async slotsOf(
    circleId: string,
    userId: string,
    payout: Money,
    months: number,
  ): Promise<AvailableSlotsResult> {
    const circle = await this.circles.findById(circleId);
    if (!circle) throw new NotFoundError('No se encontró el círculo', 'CIRCLE_NOT_FOUND');
    if (!circle.terms.payout.equals(payout) || circle.terms.months !== months) {
      throw new ValidationError('El círculo no tiene ese payout y esa duración', {
        circleId: 'terms_mismatch',
      });
    }
    if (circle.isMember(userId)) throw new AlreadyMemberError();
    const now = this.clock.now();
    if (!circle.isRunning()) {
      const currentPeriod = Period.fromDate(now, this.assignment.timeZone);
      if (!circle.terms.startsOn.isAfter(currentPeriod)) throw new CircleAlreadyStartedError();
      return { circleId, terms: circle.terms, slots: this.regularSlots(circle) };
    }
    const today = LocalDate.fromDate(now, this.assignment.timeZone);
    const open = new Map(
      openVacancies(circle, today, this.cycle.dueDay).map(({ position, joinMonth }) => [
        position,
        joinMonth,
      ]),
    );
    return {
      circleId,
      terms: circle.terms,
      slots: this.pricing.quoteAll(circle.terms).map((quote) => {
        const joinMonth = open.get(quote.position);
        return joinMonth === undefined
          ? { ...quote, available: false }
          : {
              ...this.pricing.replacementQuote(circle.terms, quote.position, joinMonth),
              available: true,
            };
      }),
    };
  }

  private regularSlots(circle: Circle): AvailableSlot[] {
    return this.pricing.quoteAll(circle.terms).map((quote) => ({
      ...quote,
      available: !circle.isTaken(quote.position),
    }));
  }
}
