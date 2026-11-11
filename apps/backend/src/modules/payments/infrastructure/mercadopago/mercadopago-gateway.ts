import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { Money } from '../../../../shared/domain/value-objects/money';
import {
  CardRejectedError,
  type ChargeRequest,
  type ChargeSource,
  type GatewayCard,
  type GatewayPayment,
  type GatewayPaymentStatus,
  type PaymentGatewayPort,
} from '../../application/ports/payment-gateway.port';

export interface MercadoPagoSettings {
  /** Access token de la aplicación (secreto, por variable de entorno). */
  accessToken: string;
  apiUrl: string;
  timeoutMs: number;
}

type Fetch = typeof fetch;

/** Decimales de la moneda (PEN: 2): Mercado Pago recibe montos en unidades mayores. */
const fractionDigits = (currency: string): number =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

const toMajor = (money: Money): number => money.amount / 10 ** fractionDigits(money.currency);
/** La API de Orders recibe los montos como texto decimal, p. ej. `"10.00"`. */
const toDecimal = (money: Money): string => toMajor(money).toFixed(fractionDigits(money.currency));
const fromMajor = (amount: number, currency: string): Money =>
  Money.of(Math.round(amount * 10 ** fractionDigits(currency)), currency);

/** Error de la pasarela que no es un rechazo de la tarjeta: se reintenta o se investiga. */
export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** El cuerpo de la respuesta, para interpretarlo; nunca se registra ni va en el mensaje. */
    readonly body?: unknown,
  ) {
    super(message);
  }
}

interface PaymentBody {
  id: number | string;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
}

interface OrderBody {
  id: string;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  total_amount: string;
  currency?: string | null;
  transactions?: {
    payments?: ({ status?: string | null; status_detail?: string | null } | null)[] | null;
  } | null;
}

/** Yape solo cobra en soles; la API de Orders usa la moneda de la cuenta (Perú). */
const ORDER_CURRENCY = 'PEN';
/** Ventana de búsqueda de órdenes por referencia: una cuota se paga dentro de su mes y la gracia. */
const ORDER_SEARCH_DAYS = 90;
const DAY_MS = 24 * 3600 * 1000;

const isOrderBody = (value: unknown): value is OrderBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as OrderBody).id === 'string' &&
  typeof (value as OrderBody).status === 'string';

/**
 * Clave de idempotencia de la orden con forma de UUID, derivada de la de Ayni: la misma clave da
 * la misma orden y cabe en el límite de largo de `X-Idempotency-Key`.
 */
export function orderIdempotencyKey(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Los ids de pago de Mercado Pago son numéricos; los de las órdenes, alfanuméricos. */
const isPaymentId = (id: string): boolean => /^\d+$/.test(id);

/**
 * PaymentGatewayPort sobre la API REST de Mercado Pago (Checkout API, Perú):
 * - Clientes y tarjetas: `/v1/customers` y `/v1/customers/{id}/cards`.
 * - Cobro con tarjeta guardada: un token de la tarjeta (`/v1/card_tokens` con `card_id`) y luego
 *   `/v1/payments`. Cobrar sin CVV (débito automático) requiere habilitar "Automatic Payments"
 *   con Mercado Pago.
 * - Yape: una orden en `/v1/orders` (Checkout API con Orders, modo `automatic`), con el token que
 *   genera la app con el celular y el OTP. Se procesa en el momento: la respuesta trae el
 *   resultado. Un rechazo responde 402 con la orden fallida.
 * - Conciliación: los webhooks `payment` traen el id del pago y los `order`, el de la orden.
 *
 * Nunca registra tokens ni datos de tarjeta en los logs.
 */
export class MercadoPagoGateway implements PaymentGatewayPort {
  private readonly logger = new Logger('MercadoPago');

  constructor(
    private readonly settings: MercadoPagoSettings,
    private readonly http: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensureCustomer(email: string): Promise<string> {
    const found = await this.request<{ results: { id: string }[] }>(
      'GET',
      `/v1/customers/search?email=${encodeURIComponent(email)}`,
    );
    const [existing] = found.results;
    if (existing) return existing.id;
    const created = await this.request<{ id: string }>('POST', '/v1/customers', { email });
    return created.id;
  }

  async saveCard(customerId: string, cardToken: string): Promise<GatewayCard> {
    try {
      const card = await this.request<{
        id: string;
        last_four_digits: string;
        expiration_month: number;
        expiration_year: number;
        payment_method: { id: string };
      }>('POST', `/v1/customers/${encodeURIComponent(customerId)}/cards`, { token: cardToken });
      return {
        id: card.id,
        brand: card.payment_method.id,
        lastFour: card.last_four_digits,
        expirationMonth: card.expiration_month,
        expirationYear: card.expiration_year,
      };
    } catch (error) {
      if (error instanceof PaymentGatewayError && error.status === 400) {
        throw new CardRejectedError(null);
      }
      throw error;
    }
  }

  async deleteCard(customerId: string, cardId: string): Promise<void> {
    try {
      await this.request(
        'DELETE',
        `/v1/customers/${encodeURIComponent(customerId)}/cards/${encodeURIComponent(cardId)}`,
      );
    } catch (error) {
      // Ya no existe en la pasarela: el resultado es el mismo.
      if (!(error instanceof PaymentGatewayError && error.status === 404)) throw error;
    }
  }

  async charge(request: ChargeRequest): Promise<GatewayPayment> {
    const { source } = request;
    if (source.type === 'yape') return this.chargeYape(request, source);
    const { id: token } = await this.request<{ id: string }>('POST', '/v1/card_tokens', {
      card_id: source.cardId,
      customer_id: source.customerId,
    });
    const payment = await this.request<PaymentBody>(
      'POST',
      '/v1/payments',
      {
        transaction_amount: toMajor(request.amount),
        token,
        installments: 1,
        payment_method_id: source.brand,
        description: request.description,
        external_reference: request.externalReference,
        payer: { type: 'customer', id: source.customerId, email: request.payerEmail },
      },
      { 'X-Idempotency-Key': request.idempotencyKey },
    );
    return MercadoPagoGateway.toPayment(payment);
  }

  async getPayment(paymentId: string): Promise<GatewayPayment> {
    if (!isPaymentId(paymentId)) {
      return MercadoPagoGateway.toOrderPayment(
        await this.request<OrderBody>('GET', `/v1/orders/${encodeURIComponent(paymentId)}`),
      );
    }
    return MercadoPagoGateway.toPayment(
      await this.request<PaymentBody>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`),
    );
  }

  /** Los pagos con tarjeta y las órdenes de Yape con esa referencia. */
  async paymentsFor(externalReference: string): Promise<GatewayPayment[]> {
    const [payments, orders] = await Promise.all([
      this.request<{ results: PaymentBody[] }>(
        'GET',
        `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`,
      ),
      this.ordersFor(externalReference),
    ]);
    return [
      ...payments.results.map((body) => MercadoPagoGateway.toPayment(body)),
      ...orders.map((order) => MercadoPagoGateway.toOrderPayment(order)),
    ];
  }

  /**
   * Cobra con Yape creando una orden. Un rechazo responde 402 con la orden fallida (en `data`);
   * si la respuesta no la trae, se informa el rechazo con el motivo de `errors`.
   */
  private async chargeYape(
    request: ChargeRequest,
    source: Extract<ChargeSource, { type: 'yape' }>,
  ): Promise<GatewayPayment> {
    if (request.amount.currency !== ORDER_CURRENCY) {
      throw new PaymentGatewayError(`Yape solo cobra en ${ORDER_CURRENCY}`);
    }
    const amount = toDecimal(request.amount);
    const key = orderIdempotencyKey(request.idempotencyKey);
    try {
      const order = await this.request<OrderBody>(
        'POST',
        '/v1/orders',
        {
          type: 'online',
          external_reference: request.externalReference,
          processing_mode: 'automatic',
          total_amount: amount,
          payer: {
            email: request.payerEmail,
            entity_type: 'individual',
            phone: { area_code: '51', number: source.phone },
            identification: {
              type: 'DNI',
              ...(source.documentNumber ? { number: source.documentNumber } : {}),
            },
          },
          config: { location: { state_id: 'PE-LIM' } },
          transactions: {
            payments: [
              { amount, payment_method: { id: 'yape', type: 'debit_card', token: source.token } },
            ],
          },
        },
        { 'X-Idempotency-Key': key },
      );
      return MercadoPagoGateway.toOrderPayment(order);
    } catch (error) {
      if (!(error instanceof PaymentGatewayError) || error.status !== 402) throw error;
      const body = error.body as { data?: unknown; errors?: { details?: unknown[] }[] } | null;
      if (isOrderBody(body?.data)) return MercadoPagoGateway.toOrderPayment(body.data);
      // `details` trae `"<id del pago>: <motivo>"`, p. ej. `"PAY01…: insufficient_amount"`.
      const detail = body?.errors?.[0]?.details?.find(
        (item): item is string => typeof item === 'string',
      );
      return {
        id: `order:${key}`,
        status: 'rejected',
        statusDetail: detail?.split(':').pop()?.trim() || null,
        externalReference: request.externalReference,
        amount: request.amount,
      };
    }
  }

  /**
   * Las órdenes con esa referencia creadas en los últimos días. La búsqueda de órdenes no admite
   * credenciales de prueba: si Mercado Pago la niega, se avisa y se sigue solo con los pagos.
   */
  private async ordersFor(externalReference: string): Promise<OrderBody[]> {
    const now = this.now().getTime();
    const pageSize = 100;
    const query = new URLSearchParams({
      external_reference: externalReference,
      begin_date: new Date(now - ORDER_SEARCH_DAYS * DAY_MS).toISOString(),
      end_date: new Date(now + DAY_MS).toISOString(),
      page_size: String(pageSize),
    });
    try {
      const orders: OrderBody[] = [];
      let offset = 0;
      let total: number | undefined;
      while (true) {
        query.set('offset', String(offset));
        const found = await this.request<{
          data?: unknown[] | null;
          paging?: { total?: number };
        }>('GET', `/v1/orders?${query.toString()}`);
        const page = found.data ?? [];
        orders.push(...page.filter(isOrderBody));
        if (page.length === 0) break;

        offset += page.length;
        total = found.paging?.total;
        if (total === undefined ? page.length < pageSize : offset >= total) break;
      }
      return orders.filter((order) => order.external_reference === externalReference);
    } catch (error) {
      if (error instanceof PaymentGatewayError && (error.status === 401 || error.status === 403)) {
        this.logger.warn({
          event: 'payments.gateway.orders_search_unavailable',
          status: error.status,
        });
        throw error;
      }
      throw error;
    }
  }

  /**
   * `processed` es cobrada; `failed`, `canceled`, `refunded` y `charged_back` no; el resto
   * (`created`, `processing`, `action_required`) sigue en proceso. El motivo es el del pago si lo
   * trae (p. ej. `insufficient_amount`), si no el de la orden.
   */
  private static toOrderPayment(order: OrderBody): GatewayPayment {
    const status: GatewayPaymentStatus =
      order.status === 'processed'
        ? 'approved'
        : ['failed', 'canceled', 'refunded', 'charged_back'].includes(order.status)
          ? 'rejected'
          : 'pending';
    const payment = order.transactions?.payments?.find((item) => item?.status_detail);
    return {
      id: order.id,
      status,
      statusDetail: payment?.status_detail ?? order.status_detail ?? null,
      externalReference: order.external_reference ?? null,
      amount: fromMajor(Number(order.total_amount), order.currency ?? ORDER_CURRENCY),
    };
  }

  private static toPayment(body: PaymentBody): GatewayPayment {
    const status: GatewayPaymentStatus =
      body.status === 'approved'
        ? 'approved'
        : ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(body.status)
          ? 'rejected'
          : 'pending';
    return {
      id: String(body.id),
      status,
      statusDetail: body.status_detail ?? null,
      externalReference: body.external_reference ?? null,
      amount: fromMajor(body.transaction_amount, body.currency_id),
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.http(`${this.settings.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.settings.accessToken}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      throw new PaymentGatewayError(
        // Solo el nombre del error (p. ej. TimeoutError): el mensaje puede traer la URL.
        `Mercado Pago no respondió: ${(error as { name?: string } | null)?.name ?? 'error'}`,
      );
    }
    if (!response.ok) {
      // Solo el método, la ruta sin parámetros y el estado: nunca el cuerpo, que puede traer datos.
      this.logger.warn({
        event: 'payments.gateway.error',
        method,
        path: path.split('?')[0],
        status: response.status,
      });
      throw new PaymentGatewayError(
        `Mercado Pago respondió ${response.status} en ${method} ${path.split('?')[0]}`,
        response.status,
        await response.json().catch(() => null),
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
