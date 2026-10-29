import { randomUUID } from 'node:crypto';

import {
  CardRejectedError,
  type ChargeRequest,
  type GatewayCard,
  type GatewayPayment,
  type PaymentGatewayPort,
} from '../application/ports/payment-gateway.port';

/**
 * Pasarela simulada para desarrollo y pruebas (prohibida en production). Acepta todo token salvo
 * los que empiezan con `rejected`, como las tarjetas de prueba de Mercado Pago; un cobro con un
 * token o una tarjeta `rejected…` se rechaza. Idempotente por clave.
 */
export class FakePaymentGateway implements PaymentGatewayPort {
  private readonly customers = new Map<string, string>();
  private readonly cards = new Map<string, GatewayCard & { customerId: string }>();
  private readonly payments = new Map<string, GatewayPayment>();
  private readonly byKey = new Map<string, string>();

  ensureCustomer(email: string): Promise<string> {
    const id = this.customers.get(email) ?? `cus-${randomUUID()}`;
    this.customers.set(email, id);
    return Promise.resolve(id);
  }

  saveCard(customerId: string, cardToken: string): Promise<GatewayCard> {
    if (cardToken.startsWith('rejected')) return Promise.reject(new CardRejectedError(null));
    const card: GatewayCard = {
      id: `card-${cardToken}`,
      brand: 'visa',
      lastFour: '4242',
      expirationMonth: 12,
      expirationYear: 2030,
    };
    this.cards.set(card.id, { ...card, customerId });
    return Promise.resolve(card);
  }

  deleteCard(_customerId: string, cardId: string): Promise<void> {
    this.cards.delete(cardId);
    return Promise.resolve();
  }

  charge(request: ChargeRequest): Promise<GatewayPayment> {
    const previous = this.byKey.get(request.idempotencyKey);
    if (previous) return Promise.resolve(this.payments.get(previous)!);
    const reference = request.source.type === 'yape' ? request.source.token : request.source.cardId;
    const payment: GatewayPayment = {
      id: `pay-${randomUUID()}`,
      status: reference.includes('rejected') ? 'rejected' : 'approved',
      statusDetail: reference.includes('rejected') ? 'cc_rejected_other_reason' : 'accredited',
      externalReference: request.externalReference,
      amount: request.amount,
    };
    this.payments.set(payment.id, payment);
    this.byKey.set(request.idempotencyKey, payment.id);
    return Promise.resolve(payment);
  }

  paymentsFor(externalReference: string): Promise<GatewayPayment[]> {
    return Promise.resolve(
      [...this.payments.values()].filter(
        (payment) => payment.externalReference === externalReference,
      ),
    );
  }

  getPayment(paymentId: string): Promise<GatewayPayment> {
    const payment = this.payments.get(paymentId);
    return payment
      ? Promise.resolve(payment)
      : Promise.reject(new Error(`No existe el pago ${paymentId}`));
  }
}
