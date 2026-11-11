import { createHmac } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import {
  MercadoPagoGateway,
  orderIdempotencyKey,
  PaymentGatewayError,
} from '@src/modules/payments/infrastructure/mercadopago/mercadopago-gateway';
import { isValidWebhookSignature } from '@src/modules/payments/infrastructure/mercadopago/webhook-signature';
import { UnconfiguredPaymentGateway } from '@src/modules/payments/infrastructure/unconfigured-payment-gateway';
import { Money } from '@src/shared/domain/value-objects/money';

const SETTINGS = { accessToken: 'TEST-token-secreto', apiUrl: 'https://api.test', timeoutMs: 1000 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NOW = new Date('2026-11-10T15:00:00Z');
function gateway(...responses: Response[]) {
  const http = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  for (const response of responses) http.mockResolvedValueOnce(response);
  return { http, mp: new MercadoPagoGateway(SETTINGS, http, () => NOW) };
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
const YAPE = {
  type: 'yape' as const,
  token: 'yape-tok',
  phone: '111111111',
  documentNumber: null,
};
const YAPE_CHARGE = {
  idempotencyKey: 'inst-1:k-1',
  amount: Money.of(1000, 'PEN'),
  description: 'Cuota de diciembre',
  payerEmail: 'ana@mail.com',
  externalReference: 'inst-1',
  source: YAPE,
};
/** Orden de la API de Orders, como la del ejemplo de Mercado Pago para Yape. */
const ORDER = {
  id: 'ORDPE01EXAMPLEPE1234NCAKKBF68N64S',
  type: 'online',
  processing_mode: 'automatic',
  external_reference: 'inst-1',
  total_amount: '10.00',
  total_paid_amount: '10.00',
  status: 'processed',
  status_detail: 'accredited',
  transactions: {
    payments: [
      {
        id: 'PAYPE01EXAMPLEPE1234BSAR5ZWXX5YZG',
        amount: '10.00',
        paid_amount: '10.00',
        status: 'processed',
        status_detail: 'accredited',
        payment_method: { id: 'yape', type: 'debit_card' },
      },
    ],
  },
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

  it('cobra con Yape creando una orden con el token, el celular y la clave derivada', async () => {
    const { http, mp } = gateway(json(ORDER, 201));
    await expect(
      mp.charge({ ...YAPE_CHARGE, source: { ...YAPE, documentNumber: '12345678' } }),
    ).resolves.toEqual({
      id: 'ORDPE01EXAMPLEPE1234NCAKKBF68N64S',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: 'inst-1',
      amount: Money.of(1000, 'PEN'),
    });
    const call = callOf(http, 0);
    expect(call).toMatchObject({
      url: 'https://api.test/v1/orders',
      method: 'POST',
      headers: {
        Authorization: 'Bearer TEST-token-secreto',
        'X-Idempotency-Key': orderIdempotencyKey('inst-1:k-1'),
      },
    });
    expect(call.body).toEqual({
      type: 'online',
      external_reference: 'inst-1',
      processing_mode: 'automatic',
      total_amount: '10.00',
      payer: {
        email: 'ana@mail.com',
        entity_type: 'individual',
        phone: { area_code: '51', number: '111111111' },
        identification: { type: 'DNI', number: '12345678' },
      },
      config: { location: { state_id: 'PE-LIM' } },
      transactions: {
        payments: [
          {
            amount: '10.00',
            payment_method: { id: 'yape', type: 'debit_card', token: 'yape-tok' },
          },
        ],
      },
    });
  });

  it('la clave de la orden tiene forma de UUID y es la misma para la misma clave de Ayni', () => {
    const key = orderIdempotencyKey('inst-1:k-1');
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(orderIdempotencyKey('inst-1:k-1')).toBe(key);
    expect(orderIdempotencyKey('inst-1:k-2')).not.toBe(key);
  });

  it('un Yape rechazado (402) devuelve la orden fallida con el motivo del pago', async () => {
    const [payment] = ORDER.transactions.payments;
    const failed = {
      ...ORDER,
      status: 'failed',
      status_detail: 'failed',
      transactions: {
        payments: [{ ...payment, status: 'failed', status_detail: 'insufficient_amount' }],
      },
    };
    const withOrder = gateway(
      json({ errors: [{ code: 'failed', message: 'transactions failed' }], data: failed }, 402),
    );
    await expect(withOrder.mp.charge(YAPE_CHARGE)).resolves.toMatchObject({
      id: ORDER.id,
      status: 'rejected',
      statusDetail: 'insufficient_amount',
    });

    // Sin la orden en la respuesta, el motivo sale de errors[].details.
    const withoutOrder = gateway(
      json(
        { errors: [{ code: 'failed', details: ['PAYPE01X: required_call_for_authorize'] }] },
        402,
      ),
    );
    await expect(withoutOrder.mp.charge(YAPE_CHARGE)).resolves.toEqual({
      id: `order:${orderIdempotencyKey('inst-1:k-1')}`,
      status: 'rejected',
      statusDetail: 'required_call_for_authorize',
      externalReference: 'inst-1',
      amount: Money.of(1000, 'PEN'),
    });
  });

  it('Yape solo cobra en soles y otro error de la API no es un rechazo', async () => {
    const { http, mp } = gateway();
    await expect(
      mp.charge({ ...YAPE_CHARGE, amount: Money.of(1000, 'USD') }),
    ).rejects.toBeInstanceOf(PaymentGatewayError);
    expect(http).not.toHaveBeenCalled();
    const conflict = gateway(json({ errors: [{ code: 'idempotency_key_already_used' }] }, 409));
    await expect(conflict.mp.charge(YAPE_CHARGE)).rejects.toMatchObject({ status: 409 });
  });

  it('consulta una orden por su id y normaliza sus estados', async () => {
    const { http, mp } = gateway(json(ORDER));
    await expect(mp.getPayment(ORDER.id)).resolves.toMatchObject({ status: 'approved' });
    expect(callOf(http, 0)).toMatchObject({
      url: `https://api.test/v1/orders/${ORDER.id}`,
      method: 'GET',
    });

    const statusOf = async (status: string) =>
      (await gateway(json({ ...ORDER, status })).mp.getPayment(ORDER.id)).status;
    for (const status of ['failed', 'canceled', 'refunded', 'charged_back']) {
      await expect(statusOf(status)).resolves.toBe('rejected');
    }
    for (const status of ['created', 'processing', 'action_required']) {
      await expect(statusOf(status)).resolves.toBe('pending');
    }
  });

  it('busca los pagos y las órdenes de una referencia en los últimos 90 días', async () => {
    const { http, mp } = gateway(
      json({ results: [PAYMENT] }),
      json({ data: [ORDER, { ...ORDER, id: 'ORD-OTRA', external_reference: 'inst-10' }] }),
    );
    const found = await mp.paymentsFor('inst-1');
    expect(found.map(({ id }) => id)).toEqual(['123', ORDER.id]);
    const url = new URL(callOf(http, 1).url);
    expect(url.pathname).toBe('/v1/orders');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      external_reference: 'inst-1',
      begin_date: '2026-08-12T15:00:00.000Z',
      end_date: '2026-11-11T15:00:00.000Z',
      page: '1',
      page_size: '100',
    });
  });

  /** Mock que responde según la ruta y la página pedidas, sin depender del orden de las llamadas. */
  function routed(pages: {
    payments?: Record<string, unknown>[];
    orders?: Record<string, unknown>[];
  }) {
    const http = jest.fn((url: string) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname === '/v1/payments/search') {
        const offset = Number(searchParams.get('offset'));
        return Promise.resolve(json(pages.payments?.[offset / 100] ?? { results: [] }));
      }
      const page = Number(searchParams.get('page'));
      return Promise.resolve(json(pages.orders?.[page - 1] ?? { data: [] }));
    });
    return {
      http,
      mp: new MercadoPagoGateway(SETTINGS, http as unknown as typeof fetch, () => NOW),
    };
  }
  const urlsOf = (http: jest.Mock, path: string) =>
    (http.mock.calls as [string][])
      .map(([url]) => new URL(url))
      .filter(({ pathname }) => pathname === path)
      .map(({ searchParams }) => Object.fromEntries(searchParams));

  it('recorre todas las páginas de órdenes: la aprobada en la segunda página aparece', async () => {
    const failed = Array.from({ length: 100 }, (_, i) => ({
      ...ORDER,
      id: `ORD-F${i}`,
      status: 'failed',
    }));
    const paging = { total: '101', total_pages: '2', offset: '0', limit: '100' };
    const { http, mp } = routed({
      orders: [
        { data: failed, paging },
        { data: [ORDER], paging: { ...paging, offset: '100' } },
      ],
    });
    const found = await mp.paymentsFor('inst-1');
    expect(found).toHaveLength(101);
    expect(found.find(({ status }) => status === 'approved')?.id).toBe(ORDER.id);
    expect(urlsOf(http, '/v1/orders').map(({ page }) => page)).toEqual(['1', '2']);
  });

  it('sin paging, sigue mientras la página venga llena', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      ...ORDER,
      id: `ORD-F${i}`,
      status: 'failed',
    }));
    const { http, mp } = routed({ orders: [{ data: full }, { data: [ORDER] }] });
    await expect(mp.paymentsFor('inst-1')).resolves.toHaveLength(101);
    expect(urlsOf(http, '/v1/orders')).toHaveLength(2);
  });

  it('recorre todas las páginas de pagos con offset y limit', async () => {
    const rejected = Array.from({ length: 100 }, (_, i) => ({
      ...PAYMENT,
      id: 1000 + i,
      status: 'rejected',
    }));
    const paging = { total: 101, limit: 100 };
    const { http, mp } = routed({
      payments: [
        { results: rejected, paging: { ...paging, offset: 0 } },
        { results: [PAYMENT], paging: { ...paging, offset: 100 } },
      ],
    });
    const found = await mp.paymentsFor('inst-1');
    expect(found.filter(({ status }) => status === 'approved')).toHaveLength(1);
    expect(urlsOf(http, '/v1/payments/search')).toEqual([
      { external_reference: 'inst-1', limit: '100', offset: '0' },
      { external_reference: 'inst-1', limit: '100', offset: '100' },
    ]);
  });

  it('si la búsqueda supera el tope de páginas, falla en vez de dar un historial parcial', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const full = { data: Array.from({ length: 100 }, (_, i) => ({ ...ORDER, id: `ORD-${i}` })) };
    const { mp } = routed({ orders: Array.from({ length: 50 }, () => full) });
    await expect(mp.paymentsFor('inst-1')).rejects.toBeInstanceOf(PaymentGatewayError);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payments.gateway.search_too_large', search: 'orders' }),
    );
  });

  it('con credenciales de producción, una negativa (401/403) de la búsqueda de órdenes falla', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    for (const status of [401, 403]) {
      const http = jest.fn((url: string) =>
        Promise.resolve(
          new URL(url).pathname === '/v1/orders' ? json({}, status) : json({ results: [PAYMENT] }),
        ),
      );
      const mp = new MercadoPagoGateway(
        { ...SETTINGS, accessToken: 'APP_USR-token-secreto' },
        http as unknown as typeof fetch,
        () => NOW,
      );
      await expect(mp.paymentsFor('inst-1')).rejects.toMatchObject({ status });
    }
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payments.gateway.orders_search_unavailable',
        tolerated: false,
      }),
    );
  });

  it('una negativa (403) a mitad de la paginación no se tolera', async () => {
    const full = { data: Array.from({ length: 100 }, (_, i) => ({ ...ORDER, id: `ORD-${i}` })) };
    const http = jest.fn((url: string) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname === '/v1/payments/search') return Promise.resolve(json({ results: [] }));
      return Promise.resolve(searchParams.get('page') === '1' ? json(full) : json({}, 403));
    });
    const mp = new MercadoPagoGateway(SETTINGS, http as unknown as typeof fetch, () => NOW);
    await expect(mp.paymentsFor('inst-1')).rejects.toMatchObject({ status: 403 });
  });

  it('con credenciales de prueba, si la búsqueda de órdenes no está permitida, sigue solo con los pagos', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const denied = gateway(json({ results: [PAYMENT] }), json({}, 403));
    await expect(denied.mp.paymentsFor('inst-1')).resolves.toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payments.gateway.orders_search_unavailable',
        status: 403,
        tolerated: true,
      }),
    );
    const broken = gateway(json({ results: [] }), json({}, 500));
    await expect(broken.mp.paymentsFor('inst-1')).rejects.toMatchObject({ status: 500 });
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
        source: { type: 'yape', token: 'rejected', phone: '111111111', documentNumber: null },
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
