import { Logger } from '@nestjs/common';

import {
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
import {
  contributionDates,
  payoutPeriodAfter,
  type SavingSubscription,
} from '@src/modules/savings/domain/saving-subscription';
import { User } from '@src/modules/users/domain/entities/user';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCards } from '@test/support/in-memory-cards';

describe('calendario de aportes', () => {
  it('el mismo día de cada mes; en un mes corto, su último día', () => {
    expect(contributionDates('2026-12-15', 3)).toEqual(['2026-12-15', '2027-01-15', '2027-02-15']);
    expect(contributionDates('2027-01-31', 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(payoutPeriodAfter('2027-11-15')).toBe('2027-12');
    expect(payoutPeriodAfter('2027-12-15')).toBe('2028-01');
  });
});

class InMemorySubscriptions implements SavingSubscriptionsPort {
  readonly rows: { subscription: SavingSubscription; key: string }[] = [];

  findByKey(userId: string, key: string) {
    const row = this.rows.find((r) => r.subscription.userId === userId && r.key === key);
    return Promise.resolve(row ? structuredClone(row.subscription) : null);
  }

  create(subscription: SavingSubscription, key: string) {
    this.rows.push({ subscription: structuredClone(subscription), key });
    return Promise.resolve(subscription);
  }

  listOf(userId: string) {
    return Promise.resolve(
      this.rows.filter((r) => r.subscription.userId === userId).map((r) => r.subscription),
    );
  }

  markPaid(contributionId: string, paidAt: Date) {
    for (const { subscription } of this.rows) {
      const contribution = subscription.contributions.find(({ id }) => id === contributionId);
      if (contribution?.status === 'pending') {
        Object.assign(contribution, { status: 'paid', paidAt });
        subscription.status = subscription.contributions.every(({ status }) => status === 'paid')
          ? 'completed'
          : 'active';
      }
    }
    return Promise.resolve();
  }

  reject(subscriptionId: string, detail: string | null) {
    const row = this.rows.find((r) => r.subscription.id === subscriptionId);
    if (row?.subscription.status === 'pending') {
      Object.assign(row.subscription, { status: 'rejected', rejection: detail });
    }
    return Promise.resolve();
  }

  dueForAutoDebit(): Promise<DueContribution[]> {
    return Promise.resolve([]);
  }

  pendingFirstPayments(): Promise<DueContribution[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.subscription.status === 'pending')
        .map((r) => ({
          subscription: r.subscription,
          contribution: r.subscription.contributions[0]!,
        })),
    );
  }
}

const CATALOG = SavingCatalog.create({
  plans: [{ id: 'lite', target: Money.of(300_000, 'PEN') }],
  cashbackBps: new Map([[6, 500]]),
});
const users = {
  findById: () =>
    Promise.resolve(
      User.restore({
        id: 'u-1',
        email: 'ana@mail.com',
        phone: null,
        status: 'active',
        preferredLanguage: null,
      }),
    ),
  findOrRegister: jest.fn(),
  findByIdentifier: jest.fn(),
  save: jest.fn(),
};
const KEY = 'clave-de-prueba-0001';

function gatewayWith(status: GatewayPayment['status']): PaymentGatewayPort & { charges: number } {
  const payments: GatewayPayment[] = [];
  return {
    charges: 0,
    ensureCustomer: jest.fn(),
    saveCard: jest.fn(),
    deleteCard: jest.fn(),
    getPayment: jest.fn(),
    charge(request) {
      this.charges += 1;
      const payment: GatewayPayment = {
        id: `pay-${String(this.charges)}`,
        status,
        statusDetail: status === 'rejected' ? 'cc_rejected_insufficient_amount' : 'accredited',
        externalReference: request.externalReference,
        amount: request.amount,
      };
      payments.push(payment);
      return Promise.resolve(payment);
    },
    paymentsFor: (reference) =>
      Promise.resolve(payments.filter(({ externalReference }) => externalReference === reference)),
  };
}

async function setup(status: GatewayPayment['status']) {
  const subscriptions = new InMemorySubscriptions();
  const cards = new InMemoryCards();
  await cards.saveCustomer('u-1', 'cus-1');
  const card = await cards.add(
    'u-1',
    { id: 'card-1', brand: 'visa', lastFour: '4242', expirationMonth: 12, expirationYear: 2030 },
    'k',
  );
  const gateway = gatewayWith(status);
  const clock = new TestClock(new Date('2026-12-15T15:00:00Z'));
  const settings = { timeZone: 'America/Lima', startOffsetMonths: 0 };
  return {
    subscriptions,
    gateway,
    cardId: card.id,
    subscribe: new SubscribeToSavingPlanUseCase(
      subscriptions,
      CATALOG,
      settings,
      gateway,
      cards,
      users,
      clock,
    ),
    collect: new CollectSavingContributionsUseCase(
      subscriptions,
      settings,
      gateway,
      cards,
      users,
      clock,
    ),
  };
}

describe('SubscribeToSavingPlanUseCase', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('con el cobro aprobado queda activa; repetir con la misma clave no cobra de nuevo', async () => {
    const { subscribe, gateway, cardId } = await setup('approved');
    const input = { planId: 'lite', months: 6, cardId, autoDebit: true };
    const subscription = await subscribe.execute({ userId: 'u-1' }, input, KEY);
    expect(subscription).toMatchObject({
      status: 'active',
      payoutPeriod: '2027-06',
      contributions: expect.arrayContaining([
        expect.objectContaining({ sequence: 1, dueOn: '2026-12-15', status: 'paid' }),
        expect.objectContaining({ sequence: 6, dueOn: '2027-05-15', status: 'pending' }),
      ]),
    });
    await subscribe.execute({ userId: 'u-1' }, input, KEY);
    expect(gateway.charges).toBe(1);
  });

  it('con el cobro rechazado no queda suscrita y devuelve el motivo, también al repetir', async () => {
    const { subscribe, cardId, subscriptions } = await setup('rejected');
    const input = { planId: 'lite', months: 6, cardId, autoDebit: false };
    const rejected = expect.objectContaining({
      code: 'SAVING_PAYMENT_REJECTED',
      details: { detail: 'cc_rejected_insufficient_amount' },
    });
    await expect(subscribe.execute({ userId: 'u-1' }, input, KEY)).rejects.toEqual(rejected);
    await expect(subscribe.execute({ userId: 'u-1' }, input, KEY)).rejects.toEqual(rejected);
    expect(subscriptions.rows[0]!.subscription.status).toBe('rejected');
  });

  it('un cobro pendiente queda pendiente y la tarea diaria lo resuelve', async () => {
    const { subscribe, collect, cardId, subscriptions, gateway } = await setup('pending');
    const input = { planId: 'lite', months: 6, cardId, autoDebit: true };
    await expect(subscribe.execute({ userId: 'u-1' }, input, KEY)).resolves.toMatchObject({
      status: 'pending',
    });
    // La pasarela lo aprueba después.
    const reference = subscriptions.rows[0]!.subscription.contributions[0]!.id;
    const [payment] = await gateway.paymentsFor(reference);
    payment!.status = 'approved';
    await collect.execute();
    expect(subscriptions.rows[0]!.subscription.status).toBe('active');
  });

  it('exige la clave de idempotencia y una tarjeta propia', async () => {
    const { subscribe, cardId } = await setup('approved');
    const input = { planId: 'lite', months: 6, cardId, autoDebit: false };
    await expect(subscribe.execute({ userId: 'u-1' }, input, undefined)).rejects.toMatchObject({
      details: { idempotencyKey: 'invalid' },
    });
    await expect(
      subscribe.execute({ userId: 'u-1' }, { ...input, cardId: 'otra' }, KEY),
    ).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });
});
