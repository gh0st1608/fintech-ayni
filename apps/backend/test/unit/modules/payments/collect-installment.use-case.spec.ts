import { Logger } from '@nestjs/common';

import { type SavedCardRepositoryPort } from '@src/modules/payments/application/ports/saved-card-repository.port';
import { CollectInstallmentUseCase } from '@src/modules/payments/application/use-cases/collect-installment.use-case';
import { GatewayCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import { MercadoPagoGateway } from '@src/modules/payments/infrastructure/mercadopago/mercadopago-gateway';
import { UnconfiguredPaymentGateway } from '@src/modules/payments/infrastructure/unconfigured-payment-gateway';
import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { User } from '@src/modules/users/domain/entities/user';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';

const ANA = User.restore({
  id: 'u-1',
  email: 'ana@mail.com',
  phone: null,
  status: 'active',
  preferredLanguage: null,
});
const users: UserRepositoryPort = {
  findById: () => Promise.resolve(ANA),
  findOrRegister: jest.fn(),
  findByIdentifier: jest.fn(),
  save: jest.fn(),
};
const card = (gatewayCardId: string, isDefault = true) => ({
  id: `sc-${gatewayCardId}`,
  gatewayCardId,
  brand: 'visa',
  lastFour: '4242',
  expirationMonth: 12,
  expirationYear: 2030,
  isDefault,
  createdAt: new Date(),
});
const cardsWith = (...saved: ReturnType<typeof card>[]): SavedCardRepositoryPort => ({
  customerOf: () => Promise.resolve(saved.length ? 'cus-1' : null),
  saveCustomer: jest.fn(),
  findByIdempotencyKey: jest.fn(),
  add: jest.fn(),
  list: () => Promise.resolve(saved),
  setDefault: jest.fn(),
  remove: jest.fn(),
});

function setup(gateway = new FakePaymentGateway(), cards = cardsWith(card('card-1'))) {
  const clock = new TestClock(new Date('2026-12-05T17:00:00Z'));
  const useCase = new CollectInstallmentUseCase(
    gateway,
    cards,
    users,
    { timeZone: 'America/Lima' },
    clock,
  );
  return { gateway, clock, useCase };
}
const REQUEST = {
  installmentId: 'inst-1',
  userId: 'u-1',
  amount: Money.of(300_000, 'PEN'),
  description: 'Ayni: cuota de 2026-12',
};

describe('Débito automático de la cuota (COPAYNI-40)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('cobra con la tarjeta predeterminada, una vez por día y cuota', async () => {
    const { gateway, useCase } = setup(
      new FakePaymentGateway(),
      cardsWith(card('card-otra', false), card('card-1')),
    );
    const charge = jest.spyOn(gateway, 'charge');
    await expect(useCase.execute(REQUEST)).resolves.toBe(true);
    expect(charge).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'inst-1:2026-12-05',
        externalReference: 'inst-1',
        payerEmail: 'ana@mail.com',
        source: { type: 'card', customerId: 'cus-1', cardId: 'card-1', brand: 'visa' },
      }),
    );
    // Ya aprobada: no se vuelve a cobrar.
    await expect(useCase.execute(REQUEST)).resolves.toBe(true);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('un cobro rechazado deja la cuota sin pagar y se reintenta otro día', async () => {
    const { gateway, clock, useCase } = setup(
      new FakePaymentGateway(),
      cardsWith(card('rejected-card')),
    );
    const charge = jest.spyOn(gateway, 'charge');
    await expect(useCase.execute(REQUEST)).resolves.toBe(false);
    clock.set(new Date('2026-12-06T17:00:00Z'));
    await useCase.execute(REQUEST);
    expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
      'inst-1:2026-12-05',
      'inst-1:2026-12-06',
    ]);
  });

  it('con un pago pendiente no vuelve a cobrar', async () => {
    const gateway = new FakePaymentGateway();
    jest.spyOn(gateway, 'paymentsFor').mockResolvedValue([
      {
        id: 'p-1',
        status: 'pending',
        statusDetail: 'pending_contingency',
        externalReference: 'inst-1',
        amount: REQUEST.amount,
      },
    ]);
    const charge = jest.spyOn(gateway, 'charge');
    await expect(setup(gateway).useCase.execute(REQUEST)).resolves.toBe(false);
    expect(charge).not.toHaveBeenCalled();
  });

  it('sin tarjeta guardada (p. ej. paga con Yape) no cobra', async () => {
    const { gateway, useCase } = setup(new FakePaymentGateway(), cardsWith());
    const charge = jest.spyOn(gateway, 'charge');
    await expect(useCase.execute(REQUEST)).resolves.toBe(false);
    expect(charge).not.toHaveBeenCalled();
  });

  it('el adaptador del ciclo traduce el resultado y todavía no paga payouts (T5)', async () => {
    const { useCase } = setup();
    const discounts = {
      quote: (_userId: string, amount: Money) => Promise.resolve(Money.zero(amount.currency)),
      apply: jest.fn(),
    };
    const payments = new GatewayCyclePayments(
      useCase,
      discounts as unknown as ConstructorParameters<typeof GatewayCyclePayments>[1],
    );
    const installment = {
      id: 'inst-9',
      circleId: 'c-1',
      userId: 'u-1',
      position: 1,
      period: Period.of(2026, 12),
      dueOn: LocalDate.parse('2026-12-05'),
      amount: Money.of(300_000, 'PEN'),
      status: 'pending' as const,
    };
    await expect(payments.collect(installment)).resolves.toBe('paid');
    await expect(payments.disburse()).rejects.toThrow('T5');
    await expect(payments.refund()).rejects.toThrow('T5');
  });

  it('Mercado Pago busca los pagos por referencia externa', async () => {
    const http = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 7,
              status: 'approved',
              external_reference: 'inst-1',
              transaction_amount: 3000,
              currency_id: 'PEN',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const mp = new MercadoPagoGateway(
      { accessToken: 't', apiUrl: 'https://api.test', timeoutMs: 1000 },
      http,
    );
    await expect(mp.paymentsFor('inst-1')).resolves.toEqual([
      expect.objectContaining({ id: '7', status: 'approved', amount: Money.of(300_000, 'PEN') }),
    ]);
    expect(http.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/payments/search?external_reference=inst-1',
    );
    await expect(new UnconfiguredPaymentGateway().paymentsFor()).rejects.toThrow();
  });
});
