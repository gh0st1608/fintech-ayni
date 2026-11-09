import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { DomainError, NotFoundError } from '../../../../shared/errors/app-error';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { type StartDecision } from '../../domain/services/start-approval';
import { SlotNotAllowedError, slotRestriction } from '../../domain/services/trust-policy';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';
import { JOIN_ELIGIBILITY, type JoinEligibilityPort } from '../ports/join-eligibility.port';
import { MEMBER_HISTORY, type MemberHistoryPort } from '../ports/member-history.port';
import {
  CIRCLE_START_PROPOSALS,
  type CircleStartProposalsPort,
  type MemberStartProposal,
} from '../ports/start-proposals.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { startProposalChanged } from './start-proposal-errors';
import { SLOT_PRICING } from './get-available-slots.use-case';
import { TRUST_SETTINGS, trustProfileOf, type TrustSettings } from './trust';

/** Lo que ve un miembro para decidir (COPAYNI-62). */
export interface StartProposalView {
  circleId: string;
  round: number;
  current: CircleTerms;
  proposed: CircleTerms;
  quote: SlotQuote;
  respondBy: string;
  decision: StartDecision | null;
}

/** `GET /v1/me/circles/start-proposals`: las propuestas pendientes del usuario. */
@Injectable()
export class ListStartProposalsUseCase {
  constructor(
    @Inject(CIRCLE_START_PROPOSALS) private readonly proposals: CircleStartProposalsPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
  ) {}

  async execute({ userId }: Principal): Promise<StartProposalView[]> {
    const proposals = await this.proposals.listFor(userId);
    return proposals.map((proposal) => ({
      circleId: proposal.circleId,
      round: proposal.round,
      current: proposal.current,
      proposed: proposal.proposed,
      quote: this.pricing.quote(proposal.proposed, proposal.position),
      respondBy: proposal.respondBy.toString(),
      decision: proposal.decision,
    }));
  }
}

/**
 * `POST /v1/me/circles/:circleId/start-proposal/accept` y `/withdraw`. Se puede cambiar de opinión
 * hasta el plazo. Para aceptar, se vuelve a validar la regla de confianza con el turno nuevo
 * (COPAYNI-60): quien no puede tomarlo solo puede retirarse. Retirarse no tiene penalidad. La
 * respuesta trae la ronda que vio el miembro: si otra salida ya abrió una ronda nueva, se rechaza.
 */
@Injectable()
export class RespondStartProposalUseCase {
  private readonly logger = new Logger('CircleCycle');

  constructor(
    @Inject(CIRCLE_START_PROPOSALS) private readonly proposals: CircleStartProposalsPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(JOIN_ELIGIBILITY) private readonly eligibility: JoinEligibilityPort,
    @Inject(MEMBER_HISTORY) private readonly history: MemberHistoryPort,
    @Inject(TRUST_SETTINGS) private readonly trust: TrustSettings,
    @Inject(CIRCLE_CYCLE) private readonly settings: CircleCycleSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    { userId }: Principal,
    circleId: string,
    decision: StartDecision,
    round: number,
  ): Promise<void> {
    const proposal = (await this.proposals.listFor(userId)).find(
      (candidate) => candidate.circleId === circleId,
    );
    if (!proposal) {
      throw new NotFoundError(
        'No tienes una propuesta para ese círculo',
        'START_PROPOSAL_NOT_FOUND',
      );
    }
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone);
    if (proposal.respondBy.isBefore(today)) {
      throw new DomainError('START_PROPOSAL_EXPIRED', 'El plazo para responder ya venció');
    }
    if (proposal.round !== round) throw startProposalChanged();
    if (decision === 'accepted') await this.assertTrusted(userId, proposal);
    await this.proposals.respond(circleId, userId, decision, round);
    this.logger.log({
      event: 'circles.cycle.start_response',
      circleId,
      userId,
      decision,
      round,
    });
  }

  private async assertTrusted(userId: string, proposal: MemberStartProposal): Promise<void> {
    const type = this.pricing.typeOf(proposal.position, proposal.proposed.months);
    const profile = await trustProfileOf(userId, this.eligibility, this.history);
    const restriction = slotRestriction(type, profile, this.trust);
    if (restriction) throw new SlotNotAllowedError(restriction);
  }
}
