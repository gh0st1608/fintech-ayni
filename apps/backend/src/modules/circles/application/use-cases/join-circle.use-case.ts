import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { Period } from '../../../../shared/domain/value-objects/period';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import { Circle, IdempotencyKeyReusedError, type Membership } from '../../domain/entities/circle';
import { assertCanJoin } from '../../domain/services/join-eligibility';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { CircleTerms } from '../../domain/value-objects/circle-terms';
import {
  CIRCLE_REPOSITORY,
  type CircleRepositoryPort,
  IdempotencyKeyExistsError,
} from '../ports/circle-repository.port';
import { JOIN_ELIGIBILITY, type JoinEligibilityPort } from '../ports/join-eligibility.port';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';
import {
  CIRCLE_ASSIGNMENT,
  type CircleAssignmentSettings,
  SLOT_PRICING,
} from './get-available-slots.use-case';
import { offeredPayout } from './offered-payout';

export class CircleAlreadyStartedError extends ConflictError {
  constructor() {
    super('CIRCLE_ALREADY_STARTED', 'El círculo ya empezó: elige otro turno');
  }
}

export interface JoinCircleCommand {
  userId: string;
  /** Círculo que ofreció `slots`, o `null` para abrir uno nuevo con esas condiciones. */
  circleId: string | null;
  payoutAmount: number;
  months: number;
  position: number;
  idempotencyKey: string;
}

export interface JoinCircleResult {
  circleId: string;
  terms: CircleTerms;
  membership: Membership;
  quote: SlotQuote;
  /** false si la unión ya existía con la misma clave (reintento). */
  created: boolean;
}

/**
 * Confirma la unión a un Game'ya (COPAYNI-31): reserva el slot de forma atómica e idempotente.
 * - Un reintento con la misma clave responde la unión ya hecha, antes de volver a validar: la
 *   elegibilidad pudo cambiar desde entonces, pero la unión ya existe.
 * - Valida las condiciones como `slots` (COPAYNI-30) y la elegibilidad del usuario: National ID,
 *   límite mensual y método de cobro (`assertCanJoin`).
 * - Con `circleId: null` abre el círculo nuevo que ofreció `slots`, con el mismo inicio.
 * - El repositorio inserta con unicidad: si otra solicitud tomó el slot entre la lectura y la
 *   escritura, responde SLOT_TAKEN; si el mismo pedido llegó dos veces, responde la unión que ganó.
 */
@Injectable()
export class JoinCircleUseCase {
  private readonly logger = new Logger('Circles');

  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY) private readonly joinConfigs: JoinConfigRepositoryPort,
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_ASSIGNMENT) private readonly assignment: CircleAssignmentSettings,
    @Inject(JOIN_ELIGIBILITY) private readonly eligibility: JoinEligibilityPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: JoinCircleCommand): Promise<JoinCircleResult> {
    const previous = await this.previousJoin(command);
    if (previous) return previous;

    const joinConfig = await this.joinConfigs.getForUser(command.userId);
    const payout = offeredPayout(joinConfig, command.payoutAmount, command.months);
    const { circle, isNew } = await this.target(command, payout);
    const quote = this.pricing.quote(circle.terms, command.position);
    assertCanJoin(await this.eligibility.applicantFor(command.userId), payout, quote.installments);

    const { userId, position, idempotencyKey } = command;
    const { membership } = circle.join({ userId, position, idempotencyKey });
    try {
      if (isNew) await this.circles.create(circle);
      else await this.circles.addMembership(circle.id, membership);
    } catch (error) {
      if (!(error instanceof IdempotencyKeyExistsError)) throw error;
      // Ganó otra solicitud con la misma clave: se responde esa unión, o se rechaza si la
      // clave se usó con otros datos (o, en el mismo círculo, la usó otro usuario).
      const raced = await this.previousJoin(command);
      if (raced) return raced;
      throw new IdempotencyKeyReusedError();
    }

    this.logger.log({
      event: 'circles.joined',
      userId,
      circleId: circle.id,
      position,
      newCircle: isNew,
    });
    return { circleId: circle.id, terms: circle.terms, membership, quote, created: true };
  }

  private async previousJoin(command: JoinCircleCommand): Promise<JoinCircleResult | null> {
    const { userId, idempotencyKey } = command;
    const circle = await this.circles.findByMembershipKey(userId, idempotencyKey);
    const membership = circle?.memberships.find(
      (member) => member.userId === userId && member.idempotencyKey === idempotencyKey,
    );
    if (!circle || !membership) return null;

    const sameCircle =
      command.circleId === null
        ? circle.terms.payout.amount === command.payoutAmount &&
          circle.terms.months === command.months
        : command.circleId === circle.id;
    if (!sameCircle || membership.position !== command.position) {
      throw new IdempotencyKeyReusedError();
    }
    return {
      circleId: circle.id,
      terms: circle.terms,
      membership,
      quote: this.pricing.quote(circle.terms, membership.position),
      created: false,
    };
  }

  /** El círculo ofrecido, si sigue admitiendo miembros, o uno nuevo como el que ofreció `slots`. */
  private async target(
    command: JoinCircleCommand,
    payout: Money,
  ): Promise<{ circle: Circle; isNew: boolean }> {
    const currentPeriod = Period.fromDate(this.clock.now(), this.assignment.timeZone);
    if (command.circleId === null) {
      const terms = CircleTerms.create({
        payout,
        months: command.months,
        startsOn: currentPeriod.addMonths(this.assignment.startOffsetMonths),
      });
      return { circle: Circle.open({ id: randomUUID(), terms }), isNew: true };
    }

    const circle = await this.circles.findById(command.circleId);
    if (!circle) throw new NotFoundError('No se encontró el círculo', 'CIRCLE_NOT_FOUND');
    if (!circle.terms.payout.equals(payout) || circle.terms.months !== command.months) {
      throw new ValidationError('El círculo no tiene ese payout y esa duración', {
        circleId: 'terms_mismatch',
      });
    }
    // En un círculo ya iniciado, el cobro de los primeros slots ya pasó.
    if (!circle.terms.startsOn.isAfter(currentPeriod)) throw new CircleAlreadyStartedError();
    return { circle, isNew: false };
  }
}
