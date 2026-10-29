import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { Period } from '../../../../shared/domain/value-objects/period';
import { installmentOptions } from '../../domain/services/installment-options';
import { type SlotPricing } from '../../domain/services/slot-pricing';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';
import { CIRCLE_REPOSITORY, type CircleRepositoryPort } from '../ports/circle-repository.port';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import {
  CIRCLE_ASSIGNMENT,
  type CircleAssignmentSettings,
  SLOT_PRICING,
} from './get-available-slots.use-case';

export const RECOMMENDATIONS = Symbol('RECOMMENDATIONS');

export interface RecommendationSettings {
  /** Máximo de círculos recomendados (`RECOMMENDED_CIRCLES_LIMIT`). */
  readonly limit: number;
}

/** Candidatos que se leen para filtrar; acota la consulta aunque haya muchos círculos abiertos. */
const MAX_CANDIDATES = 50;

export interface RecommendedCircle {
  circleId: string;
  terms: CircleTerms;
  /** Las Admin Fees no dependen del slot: son un porcentaje del payout (R4). */
  adminFee: Money;
  availableSlots: number;
}

/**
 * Círculos recomendados (COPAYNI-25), con un criterio provisional coherente con la asignación
 * `fill_oldest` (pending-scope R2):
 * - Admiten al usuario: no empezaron, no están llenos y el usuario no es miembro.
 * - El usuario puede elegir sus condiciones hoy: payout permitido y duración ofrecida.
 * - Del más antiguo al más nuevo: completarlos hace que empiecen antes.
 * "Join now" entra al flujo de unión con ese payout; `slots` ofrece el mismo círculo mientras
 * siga siendo el más antiguo con esas condiciones.
 */
@Injectable()
export class ListRecommendedCirclesUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY) private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_ASSIGNMENT) private readonly assignment: CircleAssignmentSettings,
    @Inject(RECOMMENDATIONS) private readonly settings: RecommendationSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(principal: Principal): Promise<RecommendedCircle[]> {
    const [joinConfig, candidates] = await Promise.all([
      this.joinConfigs.getForUser(principal.userId),
      this.circles.listJoinable({
        startsAfter: Period.fromDate(this.clock.now(), this.assignment.timeZone),
        userId: principal.userId,
        limit: MAX_CANDIDATES,
      }),
    ]);
    return candidates
      .filter(
        ({ terms }) =>
          joinConfig.allowsPayout(terms.payout) &&
          installmentOptions(terms.payout, joinConfig.durationOptions).some(
            (option) => option.months === terms.months,
          ),
      )
      .slice(0, this.settings.limit)
      .map((circle) => ({
        circleId: circle.id,
        terms: circle.terms,
        adminFee: this.pricing.quote(circle.terms, 1).adminFee,
        availableSlots: circle.availablePositions().length,
      }));
  }
}
