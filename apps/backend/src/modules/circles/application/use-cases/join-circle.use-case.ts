import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../shared/domain/value-objects/money';
import { Period } from '../../../../shared/domain/value-objects/period';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  Circle,
  CircleAlreadyStartedError,
  IdempotencyKeyReusedError,
  type Membership,
} from '../../domain/entities/circle';
import { assertCanJoin } from '../../domain/services/join-eligibility';
import { assertSlotAllowed } from '../../domain/services/trust-policy';
import { priceOf, type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { joinQuote } from '../../domain/services/vacancy';
import { CircleTerms } from '../../domain/value-objects/circle-terms';
import {
  CIRCLE_REPOSITORY,
  type CircleRepositoryPort,
  IdempotencyKeyExistsError,
} from '../ports/circle-repository.port';
import { JOIN_ELIGIBILITY, type JoinEligibilityPort } from '../ports/join-eligibility.port';
import { MEMBER_DEBTS, type MemberDebtsPort } from '../ports/member-debts.port';
import { MEMBER_HISTORY, type MemberHistoryPort } from '../ports/member-history.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { TRUST_SETTINGS, type TrustSettings, trustProfileOf } from './trust';
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

/**
 * El usuario fue expulsado por impago y no pagó lo vencido más el cargo por mora (COPAYNI-57).
 * `amountDue` va en unidades menores, como el resto de los montos del contrato.
 */
export class MemberBlockedError extends ConflictError {
  constructor(amountDue: Money) {
    super('MEMBER_BLOCKED', 'Tienes una deuda por impago: págala para unirte a otro círculo', {
      amountDue: String(amountDue.amount),
      currency: amountDue.currency,
    });
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
 * - Rechaza al expulsado por impago con deuda abierta (MEMBER_BLOCKED, COPAYNI-57).
 * - Valida las condiciones como `slots` (COPAYNI-30) y la elegibilidad del usuario: National ID,
 *   límite mensual y método de cobro (`assertCanJoin`).
 * - Con `circleId: null` abre el círculo nuevo que ofreció `slots`, con el mismo inicio.
 * - Rechaza un tipo de turno que la regla de confianza no le permite (SLOT_NOT_ALLOWED,
 *   COPAYNI-60).
 * - En un círculo en curso solo se toma un turno vacante, con la puesta al día en las cuotas
 *   (COPAYNI-59); el límite mensual se valida con esas cuotas.
 * - Guarda con la membresía el precio del slot (COPAYNI-55): un reintento responde ese precio
 *   aunque las reglas hayan cambiado.
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
    @Inject(MEMBER_DEBTS) private readonly debts: MemberDebtsPort,
    @Inject(CIRCLE_CYCLE) private readonly cycle: Pick<CircleCycleSettings, 'dueDay'>,
    @Inject(MEMBER_HISTORY) private readonly history: MemberHistoryPort,
    @Inject(TRUST_SETTINGS) private readonly trust: TrustSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: JoinCircleCommand): Promise<JoinCircleResult> {
    const previous = await this.previousJoin(command);
    if (previous) return previous;
    await this.assertNotBlocked(command.userId);

    const joinConfig = await this.joinConfigs.getForUser(command.userId);
    const payout = offeredPayout(joinConfig, command.payoutAmount, command.months);
    const { circle, isNew } = await this.target(command, payout);
    const today = LocalDate.fromDate(this.clock.now(), this.assignment.timeZone);
    const quote = joinQuote(this.pricing, circle, command.position, today, this.cycle.dueDay);
    assertCanJoin(await this.eligibility.applicantFor(command.userId), payout, quote.installments);
    const profile = await trustProfileOf(command.userId, this.eligibility, this.history);
    assertSlotAllowed(quote.type, profile, this.trust);

    const { userId, position, idempotencyKey } = command;
    const { membership } = circle.join({
      userId,
      position,
      idempotencyKey,
      price: priceOf(quote),
    });
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
      replacement: circle.isRunning(),
    });
    return { circleId: circle.id, terms: circle.terms, membership, quote, created: true };
  }

  private async assertNotBlocked(userId: string): Promise<void> {
    const [first, ...rest] = await this.debts.openDebtsOf(userId);
    if (!first) return;
    // Un solo país y una sola moneda en el MVP: sumar monedas distintas falla (InvalidMoneyError).
    const amountDue = rest.reduce(
      (total, { overdue, lateFee }) => total.add(overdue).add(lateFee),
      first.overdue.add(first.lateFee),
    );
    throw new MemberBlockedError(Money.of(amountDue.amount, amountDue.currency));
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
      quote: this.pricing.quoteOf(circle.terms, membership.position, membership.price),
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
    // En un círculo ya iniciado, el cobro de los primeros slots ya pasó: solo se toman sus
    // vacantes mientras está en curso (COPAYNI-59).
    if (!circle.isRunning() && !circle.terms.startsOn.isAfter(currentPeriod)) {
      throw new CircleAlreadyStartedError();
    }
    return { circle, isNew: false };
  }
}
