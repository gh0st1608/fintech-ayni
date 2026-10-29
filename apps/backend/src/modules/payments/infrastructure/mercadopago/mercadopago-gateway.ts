import { Logger } from '@nestjs/common';

import { Money } from '../../../../shared/domain/value-objects/money';
import {
  CardRejectedError,
  type ChargeRequest,
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
const fromMajor = (amount: number, currency: string): Money =>
  Money.of(Math.round(amount * 10 ** fractionDigits(currency)), currency);

/** Error de la pasarela que no es un rechazo de la tarjeta: se reintenta o se investiga. */
export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
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

/**
 * PaymentGatewayPort sobre la API REST de Mercado Pago (Checkout API, Perú):
 * - Clientes y tarjetas: `/v1/customers` y `/v1/customers/{id}/cards`.
 * - Cobro con tarjeta guardada: un token de la tarjeta (`/v1/card_tokens` con `card_id`) y luego
 *   `/v1/payments`. Cobrar sin CVV (débito automático) requiere habilitar "Automatic Payments"
 *   con Mercado Pago.
 * - Yape: `/v1/payments` con `payment_method_id: yape` y el token que genera la app.
 *
 * Nunca registra tokens ni datos de tarjeta en los logs.
 */
export class MercadoPagoGateway implements PaymentGatewayPort {
  private readonly logger = new Logger('MercadoPago');

  constructor(
    private readonly settings: MercadoPagoSettings,
    private readonly http: Fetch = fetch,
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
    const token =
      source.type === 'yape'
        ? source.token
        : (
            await this.request<{ id: string }>('POST', '/v1/card_tokens', {
              card_id: source.cardId,
              customer_id: source.customerId,
            })
          ).id;
    const payment = await this.request<PaymentBody>(
      'POST',
      '/v1/payments',
      {
        transaction_amount: toMajor(request.amount),
        token,
        installments: 1,
        payment_method_id: source.type === 'yape' ? 'yape' : source.brand,
        description: request.description,
        external_reference: request.externalReference,
        payer:
          source.type === 'card'
            ? { type: 'customer', id: source.customerId, email: request.payerEmail }
            : { email: request.payerEmail },
      },
      { 'X-Idempotency-Key': request.idempotencyKey },
    );
    return MercadoPagoGateway.toPayment(payment);
  }

  async getPayment(paymentId: string): Promise<GatewayPayment> {
    return MercadoPagoGateway.toPayment(
      await this.request<PaymentBody>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`),
    );
  }

  async paymentsFor(externalReference: string): Promise<GatewayPayment[]> {
    const found = await this.request<{ results: PaymentBody[] }>(
      'GET',
      `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`,
    );
    return found.results.map((body) => MercadoPagoGateway.toPayment(body));
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
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
