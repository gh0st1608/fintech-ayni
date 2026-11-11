import { createHmac } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { type InstallmentRef } from '@src/modules/circles/application/ports/payments-query.port';
import {
  type InstallmentSettlement,
  ReconcilePaymentUseCase,
} from '@src/modules/circles/application/use-cases/pay-installment.use-cases';
import { MercadoPagoWebhookController } from '@src/modules/circles/presentation/http/controllers/mercadopago-webhook.controller';
import { ChargeInstallmentUseCase } from '@src/modules/payments/application/use-cases/charge-installment.use-case';
import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import { User } from '@src/modules/users/domain/entities/user';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCards } from '@test/support/in-memory-cards';

const INSTALLMENT: InstallmentRef = {
  id: 'inst-1',
  circleId: 'c-1',
  userId: 'u-1',
  period: Period.of(2026, 12),
  amount: Money.of(300_000, 'PEN'),
  status: 'pending',
  expelled: false,
};
const users = (email: string | null, phone: string | null = null) => ({
  findById: () =>
    Promise.resolve(
      User.restore({ id: 'u-1', email, phone, status: 'active', preferredLanguage: null }),
    ),
  findOrRegister: jest.fn(),
  findByIdentifier: jest.fn(),
  save: jest.fn(),
});
const queryWith = (installment: InstallmentRef | null) => ({
  installment: () => Promise.resolve(installment),
  dueInstallmentsOf: jest.fn(),
  transactionsOf: jest.fn(),
  transactionOf: jest.fn(),
});

describe('Cobro de una cuota desde la app (COPAYNI-63)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  const request = {
    installmentId: 'inst-1',
    userId: 'u-1',
    amount: Money.of(300_000, 'PEN'),
    description: 'Cuota',
    idempotencyKey: 'k-1',
    method: { type: 'yape' as const, token: 'yape-ok', phoneNumber: '987654321' },
  };

  it('no vuelve a cobrar una cuota ya aprobada y rechaza si hay un pago pendiente', async () => {
    const gateway = new FakePaymentGateway();
    const charge = new ChargeInstallmentUseCase(
      gateway,
      new InMemoryCards(),
      users('ana@mail.com'),
    );
    const first = await charge.execute(request);
    const spy = jest.spyOn(gateway, 'charge');
    await expect(charge.execute({ ...request, idempotencyKey: 'k-2' })).resolves.toEqual(first);
    expect(spy).not.toHaveBeenCalled();

    jest.spyOn(gateway, 'paymentsFor').mockResolvedValue([{ ...first, status: 'pending' }]);
    await expect(charge.execute(request)).rejects.toMatchObject({ code: 'PAYMENT_PENDING' });
  });

  it('exige email y una tarjeta del usuario', async () => {
    await expect(
      new ChargeInstallmentUseCase(
        new FakePaymentGateway(),
        new InMemoryCards(),
        users(null),
      ).execute(request),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' });
    await expect(
      new ChargeInstallmentUseCase(
        new FakePaymentGateway(),
        new InMemoryCards(),
        users('ana@mail.com'),
      ).execute({ ...request, method: { type: 'card', cardId: 'otra' } }),
    ).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('con Yape manda el celular del pedido o, si falta, el del perfil, y el DNI si llega', async () => {
    const gateway = new FakePaymentGateway();
    const spy = jest.spyOn(gateway, 'charge');
    await new ChargeInstallmentUseCase(gateway, new InMemoryCards(), users('ana@mail.com')).execute(
      {
        ...request,
        method: { ...request.method, phoneNumber: '+51 987 654 321', documentNumber: '12345678' },
      },
    );
    expect(spy.mock.calls[0]?.[0].source).toEqual({
      type: 'yape',
      token: 'yape-ok',
      phone: '987654321',
      documentNumber: '12345678',
    });

    await new ChargeInstallmentUseCase(
      gateway,
      new InMemoryCards(),
      users('ana@mail.com', '+51911222333'),
    ).execute({
      ...request,
      idempotencyKey: 'k-perfil',
      installmentId: 'inst-2',
      method: { type: 'yape', token: 't' },
    });
    expect(spy.mock.calls[1]?.[0].source).toMatchObject({
      phone: '911222333',
      documentNumber: null,
    });
  });

  it('con Yape exige un celular y una cuota en soles', async () => {
    const charge = new ChargeInstallmentUseCase(
      new FakePaymentGateway(),
      new InMemoryCards(),
      users('ana@mail.com'),
    );
    await expect(
      charge.execute({ ...request, method: { type: 'yape', token: 't' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { phoneNumber: 'required' } });
    await expect(
      charge.execute({ ...request, amount: Money.of(80_000, 'USD') }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { method: 'currency_not_supported' },
    });
  });
});

describe('Webhook de Mercado Pago (COPAYNI-63)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  async function approvedPayment(gateway: FakePaymentGateway, reference = 'inst-1') {
    return gateway.charge({
      idempotencyKey: `k-${reference}`,
      amount: Money.of(300_000, 'PEN'),
      description: 'x',
      payerEmail: 'ana@mail.com',
      externalReference: reference,
      source: { type: 'yape', token: 'ok', phone: '987654321', documentNumber: null },
    });
  }

  it('concilia un pago aprobado consultándolo en la pasarela', async () => {
    const gateway = new FakePaymentGateway();
    const payment = await approvedPayment(gateway);
    const settlement = { markPaid: jest.fn().mockResolvedValue('paid') };
    const reconcile = new ReconcilePaymentUseCase(
      gateway,
      queryWith(INSTALLMENT),
      settlement as unknown as InstallmentSettlement,
    );
    await expect(reconcile.execute(payment.id)).resolves.toBe('paid');
    expect(settlement.markPaid).toHaveBeenCalledWith('c-1', 'inst-1', payment.id);
  });

  it('ignora un pago rechazado o sin cuota', async () => {
    const gateway = new FakePaymentGateway();
    const rejected = await gateway.charge({
      idempotencyKey: 'k-r',
      amount: Money.of(1, 'PEN'),
      description: 'x',
      payerEmail: 'a@mail.com',
      externalReference: 'inst-1',
      source: { type: 'yape', token: 'rejected', phone: '987654321', documentNumber: null },
    });
    const orphan = await approvedPayment(gateway, 'otra');
    const settlement = { markPaid: jest.fn() };
    const reconcileWith = (installment: InstallmentRef | null) =>
      new ReconcilePaymentUseCase(
        gateway,
        queryWith(installment),
        settlement as unknown as InstallmentSettlement,
      );
    await expect(reconcileWith(INSTALLMENT).execute(rejected.id)).resolves.toBe('ignored');
    await expect(reconcileWith(null).execute(orphan.id)).resolves.toBe('ignored');
    expect(settlement.markPaid).not.toHaveBeenCalled();
  });

  it('el controlador verifica la firma antes de conciliar', async () => {
    const NOW = new Date('2026-12-05T17:00:00Z');
    const ts = String(Math.floor(NOW.getTime() / 1000));
    const reconcile = { execute: jest.fn().mockResolvedValue('paid') };
    const controller = (secret: string | null) =>
      new MercadoPagoWebhookController(
        reconcile as unknown as ReconcilePaymentUseCase,
        { secret },
        new TestClock(NOW),
      );
    const hash = createHmac('sha256', 'clave')
      .update(`id:123;request-id:req-1;ts:${ts};`)
      .digest('hex');
    const signature = `ts=${ts},v1=${hash}`;
    const body = { type: 'payment', data: { id: '123' } };

    await expect(controller('clave').receive(signature, 'req-1', '123', body)).resolves.toEqual({
      received: true,
    });
    expect(reconcile.execute).toHaveBeenCalledWith('123');
    // El data.id también puede venir solo en el cuerpo.
    await controller('clave').receive(signature, 'req-1', undefined, body);
    expect(reconcile.execute).toHaveBeenCalledTimes(2);
    // Las órdenes de Yape (Checkout API con Orders) llegan con el tipo order.
    await controller('clave').receive(signature, 'req-1', '123', {
      type: 'order',
      data: { id: '123' },
    });
    expect(reconcile.execute).toHaveBeenCalledTimes(3);
    // Otros tipos se confirman sin conciliar.
    await controller('clave').receive(signature, 'req-1', '123', {
      type: 'plan',
      data: { id: '123' },
    });
    expect(reconcile.execute).toHaveBeenCalledTimes(3);

    await expect(controller('otra').receive(signature, 'req-1', '123', body)).rejects.toMatchObject(
      {
        code: 'UNAUTHORIZED',
      },
    );
    await expect(controller(null).receive(signature, 'req-1', '123', body)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
