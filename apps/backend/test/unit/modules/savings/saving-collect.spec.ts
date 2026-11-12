import { Logger } from '@nestjs/common';

import {
  CardRejectedError,
  type GatewayPayment,
  type PaymentGatewayPort,
} from '@src/modules/payments/application/ports/payment-gateway.port';
import {
  CollectSavingContributionsUseCase,
  type DueContribution,
  type SavingSubscriptionsPort,
  SubscribeToSavingPlanUseCase,
} from '@src/modules/savings/application/subscription.use-cases';
import { SavingCatalog } from '@src/modules/savings/domain/saving-catalog';
import { type SavingSubscription } from '@src/modules/savings/domain/saving-subscription';
import { User } from '@src/modules/users/domain/entities/user';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCards } from '@test/support/in-memory-cards';

/**
 * Casos de borde del ahorro (COPAYNI-79): la tarea diaria con débito automático, los primeros
 * cobros pendientes, la clave reutilizada y los rechazos de la pasarela.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');
const NOW = new Date('2026-12-15T15:00:00Z');

function subscription(overrides: Partial<SavingSubscription> = {}): SavingSubscription {
  return {
    id: 'sub-1',
    userId: 'u-1',
    planId: 'lite',
    months: 2,
    target: pen(100_000),
    cashback: pen(5_000),
    payoutPeriod: '2027-02',
    status: 'active',
    rejection: null,
    autoDebit: true,
    cardId: 'sc-1',
    createdAt: NOW,
    contributions: [
      {
        id: 'c-1',
        sequence: 1,
        dueOn: '2026-11-15',
        amount: pen(50_000),
        status: 'paid',
        paidAt: NOW,
      },
      {
        id: 'c-2',
        sequence: 2,
        dueOn: '2026-12-15',
        amount: pen(50_000),
        status: 'pending',
        paidAt: null,
      },
    ],
    ...overrides,
  };
}

function port(due: DueContribution[], pending: DueContribution[] = []) {
  const paid: string[] = [];
  const rejected: string[] = [];
  const subscriptions: SavingSubscriptionsPort = {
    findByKey: jest.fn(() => Promise.resolve(null)),
    create: jest.fn((s: SavingSubscription) => Promise.resolve(s)),
    listOf: jest.fn(() => Promise.resolve([])),
    markPaid: (id) => {
      paid.push(id);
      return Promise.resolve();
    },
    reject: (id) => {
      rejected.push(id);
      return Promise.resolve();
    },
    dueForAutoDebit: () => Promise.resolve(due),
    pendingFirstPayments: () => Promise.resolve(pending),
  };
  return { subscriptions, paid, rejected };
}

function gateway(
  behavior: (reference: string) => GatewayPayment['status'] | Error,
  previous: GatewayPayment[] = [],
): PaymentGatewayPort {
  return {
    ensureCustomer: jest.fn(),
    saveCard: jest.fn(),
    deleteCard: jest.fn(),
    getPayment: jest.fn(),
    charge: (request) => {
      const result = behavior(request.externalReference ?? '');
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve({
        id: 'pay',
        status: result,
        statusDetail: result === 'rejected' ? 'cc_rejected_other_reason' : 'accredited',
        externalReference: request.externalReference,
        amount: request.amount,
      });
    },
    paymentsFor: (reference) =>
      Promise.resolve(previous.filter(({ externalReference }) => externalReference === reference)),
  };
}

const userWith = (email: string | null) => ({
  findById: () =>
    Promise.resolve(
      User.restore({ id: 'u-1', email, phone: null, status: 'active', preferredLanguage: null }),
    ),
  findOrRegister: jest.fn(),
  findByIdentifier: jest.fn(),
  save: jest.fn(),
});

async function cardsWithVisa(): Promise<InMemoryCards> {
  const cards = new InMemoryCards();
  await cards.saveCustomer('u-1', 'cus-1');
  await cards.add(
    'u-1',
    { id: 'card-1', brand: 'visa', lastFour: '4242', expirationMonth: 12, expirationYear: 2030 },
    'k',
  );
  return cards;
}

const settings = { timeZone: 'America/Lima', startOffsetMonths: 0 };

describe('CollectSavingContributionsUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const due = (s = subscription()) => ({ subscription: s, contribution: s.contributions[1]! });

  it('cobra el aporte del día con débito automático', async () => {
    const { subscriptions, paid } = port([due()]);
    const collect = new CollectSavingContributionsUseCase(
      subscriptions,
      settings,
      gateway(() => 'approved'),
      await cardsWithVisa(),
      userWith('ana@mail.com'),
      new TestClock(NOW),
    );
    await expect(collect.execute()).resolves.toEqual({ charged: 1, failed: 0 });
    expect(paid).toEqual(['c-2']);
  });

  it('un rechazo, una tarjeta rechazada o una falla cuentan como fallidos y no pagan', async () => {
    const cards = await cardsWithVisa();
    for (const result of [
      'rejected',
      new CardRejectedError('cc_rejected'),
      new Error('caída'),
    ] as const) {
      const { subscriptions, paid } = port([due()]);
      const collect = new CollectSavingContributionsUseCase(
        subscriptions,
        settings,
        gateway(() => result),
        cards,
        userWith('ana@mail.com'),
        new TestClock(NOW),
      );
      await expect(collect.execute()).resolves.toEqual({ charged: 0, failed: 1 });
      expect(paid).toEqual([]);
    }
  });

  it('sin la tarjeta o sin email no cobra y lo registra como fallido', async () => {
    const withoutCard = port([due(subscription({ cardId: 'otra' }))]);
    await expect(
      new CollectSavingContributionsUseCase(
        withoutCard.subscriptions,
        settings,
        gateway(() => 'approved'),
        await cardsWithVisa(),
        userWith('ana@mail.com'),
        new TestClock(NOW),
      ).execute(),
    ).resolves.toEqual({ charged: 0, failed: 1 });

    const withoutEmail = port([due()]);
    await expect(
      new CollectSavingContributionsUseCase(
        withoutEmail.subscriptions,
        settings,
        gateway(() => 'approved'),
        await cardsWithVisa(),
        userWith(null),
        new TestClock(NOW),
      ).execute(),
    ).resolves.toEqual({ charged: 0, failed: 1 });
  });

  it('un aporte ya aprobado en la pasarela se marca pagado sin cobrar de nuevo', async () => {
    const { subscriptions, paid } = port([due()]);
    const charge = jest.fn();
    const approved = gateway(
      () => 'approved',
      [
        {
          id: 'p',
          status: 'approved',
          statusDetail: null,
          externalReference: 'c-2',
          amount: pen(1),
        },
      ],
    );
    approved.charge = charge;
    await new CollectSavingContributionsUseCase(
      subscriptions,
      settings,
      approved,
      await cardsWithVisa(),
      userWith('ana@mail.com'),
      new TestClock(NOW),
    ).execute();
    expect(charge).not.toHaveBeenCalled();
    expect(paid).toEqual(['c-2']);
  });

  it('resuelve los primeros cobros pendientes: aprobado, rechazado o todavía sin respuesta', async () => {
    const first = (id: string) => {
      const s = subscription({ id, status: 'pending' });
      return { subscription: s, contribution: { ...s.contributions[0]!, id: `${id}-c1` } };
    };
    const payment = (reference: string, status: GatewayPayment['status']): GatewayPayment => ({
      id: reference,
      status,
      statusDetail: status === 'rejected' ? 'cc_rejected_other_reason' : null,
      externalReference: reference,
      amount: pen(1),
    });
    const { subscriptions, paid, rejected } = port(
      [],
      [first('ok'), first('ko'), first('wait'), first('none')],
    );
    await new CollectSavingContributionsUseCase(
      subscriptions,
      settings,
      gateway(
        () => 'approved',
        [payment('ok-c1', 'approved'), payment('ko-c1', 'rejected'), payment('wait-c1', 'pending')],
      ),
      await cardsWithVisa(),
      userWith('ana@mail.com'),
      new TestClock(NOW),
    ).execute();
    expect(paid).toEqual(['ok-c1']);
    expect(rejected).toEqual(['ko']);
  });
});

describe('SubscribeToSavingPlanUseCase: casos de borde', () => {
  const CATALOG = SavingCatalog.create({
    plans: [{ id: 'lite', target: pen(300_000) }],
    cashbackBps: new Map([[6, 500]]),
  });

  it('una clave ya usada con otro plan o duración responde IDEMPOTENCY_KEY_REUSED', async () => {
    const { subscriptions } = port([]);
    subscriptions.findByKey = () => Promise.resolve(subscription({ planId: 'lite', months: 6 }));
    const subscribe = new SubscribeToSavingPlanUseCase(
      subscriptions,
      CATALOG,
      settings,
      gateway(() => 'approved'),
      await cardsWithVisa(),
      userWith('ana@mail.com'),
      new TestClock(NOW),
    );
    const input = { planId: 'lite', months: 12, cardId: 'sc-1', autoDebit: true };
    await expect(
      subscribe.execute({ userId: 'u-1' }, input, 'clave-repetida-0001'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(
      subscribe.execute({ userId: 'u-1' }, { ...input, months: 6 }, 'clave-repetida-0001'),
    ).resolves.toMatchObject({ id: 'sub-1' });
  });
});
