import { createHmac } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import {
  MercadoPagoGateway,
  PaymentGatewayError,
} from '@src/modules/payments/infrastructure/mercadopago/mercadopago-gateway';
import { isValidWebhookSignature } from '@src/modules/payments/infrastructure/mercadopago/webhook-signature';
import { UnconfiguredPaymentGateway } from '@src/modules/payments/infrastructure/unconfigured-payment-gateway';
import { Money } from '@src/shared/domain/value-objects/money';

const SETTINGS = { accessToken: 'TEST-token-secreto', apiUrl: 'https://api.test', timeoutMs: 1000 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function gateway(...responses: Response[]) {
  const http = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  for (const response of responses) http.mockResolvedValueOnce(response);
  return { http, mp: new MercadoPagoGateway(SETTINGS, http) };
}
const callOf = (http: jest.Mock, index: number) => {
  const [url, init] = http.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
  };
};
const PAYMENT = {
  id: 123,
  status: 'approved',
  status_detail: 'accredited',
  external_reference: 'inst-1',
  transaction_amount: 30.5,
  currency_id: 'PEN',
};

describe('MercadoPagoGateway (COPAYNI-34)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('reutiliza el cliente por email o lo crea', async () => {
    const found = gateway(json({ results: [{ id: 'cus-1' }] }));
    await expect(found.mp.ensureCustomer('ana+1@mail.com')).resolves.toBe('cus-1');
    expect(callOf(found.http, 0)).toMatchObject({
      url: 'https://api.test/v1/customers/search?email=ana%2B1%40mail.com',
      method: 'GET',
      headers: { Authorization: 'Bearer TEST-token-secreto' },
    });

    const created = gateway(json({ results: [] }), json({ id: 'cus-2' }, 201));
    await expect(created.mp.ensureCustomer('ana@mail.com')).resolves.toBe('cus-2');
    expect(callOf(created.http, 1)).toMatchObject({
      method: 'POST',
      body: { email: 'ana@mail.com' },
    });
  });

  it('guarda la tarjeta del token con solo sus datos no sensibles', async () => {
    const { http, mp } = gateway(
      json({
        id: 'card-9',
        last_four_digits: '0215',
        expiration_month: 11,
        expiration_year: 2029,
        payment_method: { id: 'visa' },
        first_six_digits: '450995',
      }),
    );
    await expect(mp.saveCard('cus-1', 'tok-1')).resolves.toEqual({
      id: 'card-9',
      brand: 'visa',
      lastFour: '0215',
      expirationMonth: 11,
      expirationYear: 2029,
    });
    expect(callOf(http, 0)).toMatchObject({
      url: 'https://api.test/v1/customers/cus-1/cards',
      body: { token: 'tok-1' },
    });
  });

  it('una tarjeta rechazada responde CARD_REJECTED; otro error es PaymentGatewayError', async () => {
    await expect(gateway(json({}, 400)).mp.saveCard('cus-1', 'tok')).rejects.toMatchObject({
      code: 'CARD_REJECTED',
    });
    await expect(gateway(json({}, 500)).mp.saveCard('cus-1', 'tok')).rejects.toBeInstanceOf(
      PaymentGatewayError,
    );
  });

  it('borrar una tarjeta que ya no existe no falla', async () => {
    await expect(gateway(json({}, 404)).mp.deleteCard('cus-1', 'card-1')).resolves.toBeUndefined();
    await expect(gateway(json({}, 500)).mp.deleteCard('cus-1', 'card-1')).rejects.toBeInstanceOf(
      PaymentGatewayError,
    );
  });

  it('cobra con Yape: el token de la app, en unidades mayores y con clave de idempotencia', async () => {
    const { http, mp } = gateway(json(PAYMENT, 201));
    const payment = await mp.charge({
      idempotencyKey: 'inst-1',
      amount: Money.of(3050, 'PEN'),
      description: 'Cuota de diciembre',
      payerEmail: 'ana@mail.com',
      externalReference: 'inst-1',
      source: { type: 'yape', token: 'yape-tok' },
    });
    expect(payment).toEqual({
      id: '123',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: 'inst-1',
      amount: Money.of(3050, 'PEN'),
    });
    expect(callOf(http, 0)).toMatchObject({
      url: 'https://api.test/v1/payments',
      headers: { 'X-Idempotency-Key': 'inst-1' },
      body: {
        transaction_amount: 30.5,
        token: 'yape-tok',
        installments: 1,
        payment_method_id: 'yape',
        external_reference: 'inst-1',
        payer: { email: 'ana@mail.com' },
      },
    });
  });

  it('cobra con una tarjeta guardada: pide un token de la tarjeta y paga como cliente', async () => {
    const { http, mp } = gateway(
      json({ id: 'card-tok' }, 201),
      json({ ...PAYMENT, status: 'in_process' }, 201),
    );
    const payment = await mp.charge({
      idempotencyKey: 'inst-2',
      amount: Money.of(300_000, 'PEN'),
      description: 'Cuota',
      payerEmail: 'ana@mail.com',
      externalReference: 'inst-2',
      source: { type: 'card', customerId: 'cus-1', cardId: 'card-9', brand: 'visa' },
    });
    expect(payment.status).toBe('pending');
    expect(callOf(http, 0)).toMatchObject({
      url: 'https://api.test/v1/card_tokens',
      body: { card_id: 'card-9', customer_id: 'cus-1' },
    });
    expect(callOf(http, 1).body).toMatchObject({
      token: 'card-tok',
      payment_method_id: 'visa',
      transaction_amount: 3000,
      payer: { type: 'customer', id: 'cus-1' },
    });
  });

  it('normaliza los estados y consulta un pago', async () => {
    const statusOf = async (status: string) =>
      (await gateway(json({ ...PAYMENT, status })).mp.getPayment('123')).status;
    await expect(statusOf('rejected')).resolves.toBe('rejected');
    await expect(statusOf('cancelled')).resolves.toBe('rejected');
    await expect(statusOf('pending')).resolves.toBe('pending');
    await expect(statusOf('approved')).resolves.toBe('approved');
  });

  it('una caída de red es PaymentGatewayError y no se registra el cuerpo ni el token', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const http = jest.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const mp = new MercadoPagoGateway(SETTINGS, http);
    await expect(mp.getPayment('1')).rejects.toThrow('Mercado Pago no respondió: TimeoutError');

    await expect(
      gateway(json({ message: 'token tok-secreto' }, 401)).mp.getPayment('1'),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secreto/);
  });
});

describe('Firma de los webhooks de Mercado Pago', () => {
  const SECRET = 'clave-webhook';
  const NOW = new Date('2026-11-05T17:00:00Z');
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const sign = (manifest: string) => createHmac('sha256', SECRET).update(manifest).digest('hex');
  const valid = (overrides: Partial<Parameters<typeof isValidWebhookSignature>[0]> = {}) =>
    isValidWebhookSignature({
      signature: `ts=${ts},v1=${sign(`id:abc123;request-id:req-1;ts:${ts};`)}`,
      requestId: 'req-1',
      dataId: 'ABC123',
      secret: SECRET,
      now: NOW,
      maxAgeSeconds: 300,
      ...overrides,
    });

  it('acepta la firma del manifiesto con el data.id en minúsculas', () => {
    expect(valid()).toBe(true);
  });

  it('rechaza otra clave, otro recurso, una firma vieja o mal formada', () => {
    expect(valid({ secret: 'otra' })).toBe(false);
    expect(valid({ dataId: 'otro' })).toBe(false);
    expect(valid({ requestId: 'req-2' })).toBe(false);
    expect(valid({ now: new Date(NOW.getTime() + 301_000) })).toBe(false);
    expect(valid({ signature: undefined })).toBe(false);
    expect(valid({ signature: `ts=${ts}` })).toBe(false);
    expect(valid({ signature: `ts=x,v1=${'a'.repeat(64)}` })).toBe(false);
  });

  it('omite del manifiesto lo que no llega y acepta ts en milisegundos', () => {
    const ms = String(NOW.getTime());
    expect(
      isValidWebhookSignature({
        signature: `ts=${ms},v1=${sign(`ts:${ms};`)}`,
        requestId: undefined,
        dataId: undefined,
        secret: SECRET,
        now: NOW,
        maxAgeSeconds: 300,
      }),
    ).toBe(true);
  });
});

describe('Pasarelas de desarrollo', () => {
  it('la simulada guarda tarjetas, rechaza los tokens rejected y es idempotente', async () => {
    const fake = new FakePaymentGateway();
    const customer = await fake.ensureCustomer('ana@mail.com');
    await expect(fake.ensureCustomer('ana@mail.com')).resolves.toBe(customer);
    const card = await fake.saveCard(customer, 'tok-1');
    await expect(fake.saveCard(customer, 'rejected-1')).rejects.toMatchObject({
      code: 'CARD_REJECTED',
    });
    const request = {
      idempotencyKey: 'k-1',
      amount: Money.of(100, 'PEN'),
      description: 'x',
      payerEmail: 'ana@mail.com',
      externalReference: 'inst-1',
      source: { type: 'card' as const, customerId: customer, cardId: card.id, brand: card.brand },
    };
    const first = await fake.charge(request);
    await expect(fake.charge(request)).resolves.toEqual(first);
    await expect(fake.getPayment(first.id)).resolves.toMatchObject({ status: 'approved' });
    await expect(
      fake.charge({
        ...request,
        idempotencyKey: 'k-2',
        source: { type: 'yape', token: 'rejected' },
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    await fake.deleteCard(customer, card.id);
    await expect(fake.getPayment('otro')).rejects.toThrow();
  });

  it('sin pasarela configurada, toda operación falla', async () => {
    const none = new UnconfiguredPaymentGateway();
    for (const call of [
      () => none.ensureCustomer(),
      () => none.saveCard(),
      () => none.deleteCard(),
      () => none.charge(),
      () => none.getPayment(),
    ]) {
      await expect(call()).rejects.toThrow('PAYMENT_GATEWAY');
    }
  });
});
