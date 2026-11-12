import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../shared/domain/value-objects/local-date';
import { Period } from '../../../shared/domain/value-objects/period';
import { DomainError, NotFoundError, ValidationError } from '../../../shared/errors/app-error';
import {
  CardRejectedError,
  PAYMENT_GATEWAY,
  type GatewayPayment,
  type PaymentGatewayPort,
} from '../../payments/application/ports/payment-gateway.port';
import {
  SAVED_CARDS,
  type SavedCard,
  type SavedCardRepositoryPort,
} from '../../payments/application/ports/saved-card-repository.port';
import { EmailRequiredError } from '../../payments/application/use-cases/add-card.use-case';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../users/application/ports/user-repository.port';
import { type SavingCatalog } from '../domain/saving-catalog';
import {
  contributionDates,
  payoutPeriodAfter,
  type SavingContribution,
  SavingPaymentRejectedError,
  type SavingSubscription,
  SubscriptionKeyReusedError,
} from '../domain/saving-subscription';
import { SAVING_CATALOG, SAVING_SETTINGS, type SavingSettings } from './saving.use-cases';

export const SAVING_SUBSCRIPTIONS = Symbol('SAVING_SUBSCRIPTIONS');

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,255}$/;

export interface DueContribution {
  subscription: SavingSubscription;
  contribution: SavingContribution;
}

export interface SavingSubscriptionsPort {
  findByKey(userId: string, idempotencyKey: string): Promise<SavingSubscription | null>;
  /** Guarda la suscripción `pending` y su calendario de aportes. */
  create(subscription: SavingSubscription, idempotencyKey: string): Promise<SavingSubscription>;
  listOf(userId: string): Promise<SavingSubscription[]>;
  /** Marca el aporte pagado y, según corresponda, la suscripción activa o completada. */
  /** `paymentKey`: la clave del pago desde la app, para que repetirlo sea idempotente. */
  markPaid(contributionId: string, paidAt: Date, paymentKey?: string): Promise<void>;
  /** ¿Algún aporte de la suscripción ya se pagó con esa clave? */
  paidWithKey(subscriptionId: string, paymentKey: string): Promise<boolean>;
  reject(subscriptionId: string, detail: string | null): Promise<void>;
  /** Aportes pendientes y vencidos de suscripciones activas con débito automático. */
  dueForAutoDebit(today: string): Promise<DueContribution[]>;
  /** Suscripciones cuyo primer cobro quedó pendiente en la pasarela. */
  pendingFirstPayments(): Promise<DueContribution[]>;
}

interface ChargeDeps {
  gateway: PaymentGatewayPort;
  cards: SavedCardRepositoryPort;
  users: UserRepositoryPort;
}

/** Cobro de un aporte con la tarjeta de la suscripción. Idempotente por `idempotencyKey`. */
async function chargeContribution(
  deps: ChargeDeps,
  subscription: SavingSubscription,
  contribution: SavingContribution,
  idempotencyKey: string,
): Promise<GatewayPayment> {
  const previous = await deps.gateway.paymentsFor(contribution.id);
  const approved = previous.find(({ status }) => status === 'approved');
  if (approved) return approved;
  const card = (await deps.cards.list(subscription.userId)).find(
    ({ id }) => id === subscription.cardId,
  );
  const customerId = await deps.cards.customerOf(subscription.userId);
  if (!card || !customerId) throw new NotFoundError('No se encontró la tarjeta', 'CARD_NOT_FOUND');
  const user = await deps.users.findById(subscription.userId);
  if (!user?.email) throw new EmailRequiredError();
  try {
    return await deps.gateway.charge({
      idempotencyKey: `${contribution.id}:${idempotencyKey}`,
      amount: contribution.amount,
      description: `Ayni ahorro ${subscription.planId} ${String(contribution.sequence)}/${String(subscription.months)}`,
      payerEmail: user.email,
      externalReference: contribution.id,
      source: { type: 'card', customerId, cardId: card.gatewayCardId, brand: card.brand },
    });
  } catch (error) {
    if (error instanceof CardRejectedError) {
      return {
        id: '',
        status: 'rejected',
        statusDetail: error.details?.detail ?? null,
        externalReference: contribution.id,
        amount: contribution.amount,
      };
    }
    throw error;
  }
}

/**
 * `POST /v1/savings/subscriptions` (COPAYNI-79). Crea la suscripción y cobra el primer aporte con
 * una tarjeta guardada. Repetir con la misma `Idempotency-Key` devuelve el mismo resultado sin
 * crear otra suscripción ni volver a cobrar. Un cobro rechazado deja la suscripción `rejected`
 * (no queda suscrita) y responde SAVING_PAYMENT_REJECTED con el motivo.
 */
@Injectable()
export class SubscribeToSavingPlanUseCase {
  private readonly logger = new Logger('Savings');

  constructor(
    @Inject(SAVING_SUBSCRIPTIONS) private readonly subscriptions: SavingSubscriptionsPort,
    @Inject(SAVING_CATALOG) private readonly catalog: SavingCatalog,
    @Inject(SAVING_SETTINGS) private readonly settings: SavingSettings,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    input: { planId: string; months: number; cardId: string; autoDebit: boolean },
    idempotencyKey: string | undefined,
  ): Promise<SavingSubscription> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError('Falta un Idempotency-Key válido', {
        idempotencyKey: 'invalid',
      });
    }
    const { userId } = principal;
    const existing = await this.subscriptions.findByKey(userId, idempotencyKey);
    if (existing) {
      if (existing.planId !== input.planId || existing.months !== input.months) {
        throw new SubscriptionKeyReusedError();
      }
      return this.resultOf(existing);
    }

    const now = this.clock.now();
    const today = LocalDate.fromDate(now, this.settings.timeZone).toString();
    const quote = this.catalog.quote(
      input.planId,
      input.months,
      Period.fromDate(now, this.settings.timeZone),
    );
    const card = await this.cardOf(userId, input.cardId);
    const dates = contributionDates(today, quote.months);
    const subscription = await this.subscriptions.create(
      {
        id: randomUUID(),
        userId,
        planId: quote.planId,
        months: quote.months,
        target: quote.target,
        cashback: quote.cashback,
        payoutPeriod: payoutPeriodAfter(dates.at(-1)!),
        status: 'pending',
        rejection: null,
        autoDebit: input.autoDebit,
        cardId: card.id,
        createdAt: now,
        contributions: dates.map((dueOn, index) => ({
          id: randomUUID(),
          sequence: index + 1,
          dueOn,
          amount: quote.installments[index]!,
          status: 'pending',
          paidAt: null,
        })),
      },
      idempotencyKey,
    );

    const first = subscription.contributions[0]!;
    const payment = await chargeContribution(this.deps, subscription, first, idempotencyKey);
    if (payment.status === 'approved') {
      await this.subscriptions.markPaid(first.id, this.clock.now());
    } else if (payment.status === 'rejected') {
      await this.subscriptions.reject(subscription.id, payment.statusDetail);
    }
    this.logger.log({
      event: 'savings.subscription_created',
      userId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      months: subscription.months,
      paymentStatus: payment.status,
    });
    const saved = (await this.subscriptions.findByKey(userId, idempotencyKey))!;
    return this.resultOf(saved);
  }

  private resultOf(subscription: SavingSubscription): SavingSubscription {
    if (subscription.status === 'rejected') {
      throw new SavingPaymentRejectedError(subscription.rejection);
    }
    return subscription;
  }

  private async cardOf(userId: string, cardId: string): Promise<SavedCard> {
    const card = (await this.cards.list(userId)).find(({ id }) => id === cardId);
    if (!card) throw new NotFoundError('No se encontró la tarjeta', 'CARD_NOT_FOUND');
    return card;
  }

  /** Dependencias para `chargeContribution`. */
  private get deps(): ChargeDeps {
    return { gateway: this.gateway, cards: this.cards, users: this.users };
  }
}

/** `GET /v1/me/savings`: las suscripciones de la persona con su próximo aporte. */
@Injectable()
export class ListMySavingsUseCase {
  constructor(
    @Inject(SAVING_SUBSCRIPTIONS) private readonly subscriptions: SavingSubscriptionsPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
  ) {}

  async execute(
    principal: Principal,
  ): Promise<{ subscription: SavingSubscription; card: SavedCard | null }[]> {
    const [subscriptions, cards] = await Promise.all([
      this.subscriptions.listOf(principal.userId),
      this.cards.list(principal.userId),
    ]);
    return subscriptions
      .filter(({ status }) => status !== 'rejected')
      .map((subscription) => ({
        subscription,
        card: cards.find(({ id }) => id === subscription.cardId) ?? null,
      }));
  }
}

/**
 * La tarea diaria cobra los aportes vencidos con débito automático, y resuelve los primeros
 * cobros que quedaron pendientes en la pasarela. Un cobro rechazado se reintenta al día siguiente
 * (clave por día); nunca se cobra dos veces el mismo aporte.
 */
@Injectable()
export class CollectSavingContributionsUseCase {
  private readonly logger = new Logger('Savings');

  constructor(
    @Inject(SAVING_SUBSCRIPTIONS) private readonly subscriptions: SavingSubscriptionsPort,
    @Inject(SAVING_SETTINGS) private readonly settings: SavingSettings,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<{ charged: number; failed: number }> {
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone).toString();
    const result = { charged: 0, failed: 0 };

    for (const { subscription, contribution } of await this.subscriptions.pendingFirstPayments()) {
      const payments = await this.gateway.paymentsFor(contribution.id);
      if (payments.some(({ status }) => status === 'approved')) {
        await this.subscriptions.markPaid(contribution.id, this.clock.now());
      } else if (payments.length > 0 && payments.every(({ status }) => status === 'rejected')) {
        await this.subscriptions.reject(subscription.id, payments.at(-1)?.statusDetail ?? null);
      }
    }

    for (const { subscription, contribution } of await this.subscriptions.dueForAutoDebit(today)) {
      try {
        const payment = await chargeContribution(
          { gateway: this.gateway, cards: this.cards, users: this.users },
          subscription,
          contribution,
          today,
        );
        if (payment.status === 'approved') {
          await this.subscriptions.markPaid(contribution.id, this.clock.now());
          result.charged += 1;
        } else {
          result.failed += 1;
        }
      } catch (error) {
        result.failed += 1;
        this.logger.warn({
          event: 'savings.contribution_charge_failed',
          subscriptionId: subscription.id,
          contributionId: contribution.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.log({ event: 'savings.contributions_collected', today, ...result });
    return result;
  }
}

/** El aporte todavía no vence: no se paga por adelantado. */
export class ContributionNotDueError extends DomainError {
  constructor(dueOn: string) {
    super('CONTRIBUTION_NOT_DUE', 'El próximo aporte todavía no vence', { dueOn });
  }
}

/**
 * `POST /v1/me/savings/:id/contributions/pay` (COPAYNI-93): quien no tiene débito automático
 * paga desde la app el aporte pendiente más antiguo, si ya venció o vence hoy. Idempotente por
 * `Idempotency-Key`: reintentar no cobra dos veces. Un rechazo deja el aporte pendiente.
 */
@Injectable()
export class PayContributionUseCase {
  private readonly logger = new Logger('Savings');

  constructor(
    @Inject(SAVING_SUBSCRIPTIONS) private readonly subscriptions: SavingSubscriptionsPort,
    @Inject(SAVING_SETTINGS) private readonly settings: SavingSettings,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    subscriptionId: string,
    cardId: string,
    idempotencyKey: string | undefined,
  ): Promise<SavingSubscription> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError('Falta un Idempotency-Key válido', {
        idempotencyKey: 'invalid',
      });
    }
    const mine = await this.subscriptions.listOf(principal.userId);
    const owned = mine.find(({ id }) => id === subscriptionId);
    // Repetir un pago ya hecho devuelve el plan sin cobrar de nuevo.
    if (owned && (await this.subscriptions.paidWithKey(subscriptionId, idempotencyKey))) {
      return owned;
    }
    const subscription = owned?.status === 'active' ? owned : undefined;
    if (!subscription) {
      throw new NotFoundError(
        'No existe ese plan de ahorro activo',
        'SAVING_SUBSCRIPTION_NOT_FOUND',
      );
    }
    const contribution = subscription.contributions.find(({ status }) => status === 'pending');
    if (!contribution) return subscription;
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone).toString();
    if (contribution.dueOn > today) throw new ContributionNotDueError(contribution.dueOn);
    if (!(await this.cards.list(principal.userId)).some(({ id }) => id === cardId)) {
      throw new NotFoundError('No se encontró la tarjeta', 'CARD_NOT_FOUND');
    }

    const payment = await chargeContribution(
      { gateway: this.gateway, cards: this.cards, users: this.users },
      { ...subscription, cardId },
      contribution,
      idempotencyKey,
    );
    this.logger.log({
      event: 'savings.contribution_paid_from_app',
      subscriptionId,
      sequence: contribution.sequence,
      status: payment.status,
    });
    if (payment.status === 'rejected') throw new SavingPaymentRejectedError(payment.statusDetail);
    if (payment.status === 'approved') {
      await this.subscriptions.markPaid(contribution.id, this.clock.now(), idempotencyKey);
    }
    const updated = (await this.subscriptions.listOf(principal.userId)).find(
      ({ id }) => id === subscriptionId,
    );
    return updated ?? subscription;
  }
}
