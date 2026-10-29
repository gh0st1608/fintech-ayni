import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { Period } from '../../../../shared/domain/value-objects/period';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';
import {
  CIRCLE_REPOSITORY,
  type CircleRepositoryPort,
  type MembershipStatus,
} from '../ports/circle-repository.port';
import {
  CIRCLE_ASSIGNMENT,
  type CircleAssignmentSettings,
  SLOT_PRICING,
} from './get-available-slots.use-case';

export const MY_CIRCLES_PAGE_SIZE = 20;

export interface MyCircle {
  circleId: string;
  status: MembershipStatus;
  terms: CircleTerms;
  /** Precio del slot del usuario: cuotas, Admin Fees y mes de cobro. */
  quote: SlotQuote;
  joinedAt: Date;
}

export interface MyCirclesPage {
  items: MyCircle[];
  nextCursor: string | null;
}

/**
 * Mis círculos activos o finalizados (COPAYNI-26), de la unión más reciente a la más antigua.
 * Un círculo terminó cuando su último mes ya pasó en `BUSINESS_TIME_ZONE`; uno que todavía no
 * empezó está activo.
 *
 * El precio es el congelado al unirse (COPAYNI-55); las membresías anteriores se cotizan con las
 * reglas vigentes.
 */
@Injectable()
export class ListMyCirclesUseCase {
  constructor(
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_ASSIGNMENT) private readonly assignment: CircleAssignmentSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    query: { status: MembershipStatus; cursor: string | null; limit?: number },
  ): Promise<MyCirclesPage> {
    const page = await this.circles.listMemberships({
      userId: principal.userId,
      status: query.status,
      currentPeriod: Period.fromDate(this.clock.now(), this.assignment.timeZone),
      limit: query.limit ?? MY_CIRCLES_PAGE_SIZE,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(({ circleId, terms, position, price, joinedAt }) => ({
        circleId,
        status: query.status,
        terms,
        quote: this.pricing.quoteOf(terms, position, price),
        joinedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
