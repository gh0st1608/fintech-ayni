import { type Money } from '../../../../shared/domain/value-objects/money';
import { DomainError } from '../../../../shared/errors/app-error';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Tarjeta guardada en la pasarela: solo datos no sensibles (nunca PAN ni CVC). */
export interface GatewayCard {
  /** Id de la tarjeta en la pasarela (`card_id` en Mercado Pago). */
  id: string;
  /** Marca, p. ej. `visa`, `master` (el `payment_method.id` de Mercado Pago). */
  brand: string;
  lastFour: string;
  expirationMonth: number;
  expirationYear: number;
}

/**
 * Con qué se cobra:
 * - `card`: una tarjeta guardada del cliente (débito automático, COPAYNI-40).
 * - `yape`: un token de un solo uso que la app genera con el SDK y el OTP de Yape.
 */
export type ChargeSource =
  | { type: 'card'; customerId: string; cardId: string; brand: string }
  | { type: 'yape'; token: string };

export interface ChargeRequest {
  /** Repetir la misma clave no cobra dos veces (`X-Idempotency-Key`). */
  idempotencyKey: string;
  amount: Money;
  description: string;
  payerEmail: string;
  /** Lo que el pago paga en Ayni (p. ej. el id de la cuota), para conciliar los webhooks. */
  externalReference: string;
  source: ChargeSource;
}

/** `pending`: la pasarela todavía lo procesa; se confirma por webhook. */
export type GatewayPaymentStatus = 'approved' | 'rejected' | 'pending';

export interface GatewayPayment {
  id: string;
  status: GatewayPaymentStatus;
  /** El motivo de la pasarela, p. ej. `cc_rejected_insufficient_amount`. */
  statusDetail: string | null;
  externalReference: string | null;
  amount: Money;
}

/** La pasarela rechazó la tarjeta o el token (datos inválidos, vencida, no admitida). */
export class CardRejectedError extends DomainError {
  constructor(detail: string | null) {
    super(
      'CARD_REJECTED',
      'La pasarela de pago rechazó la tarjeta',
      detail ? { detail } : undefined,
    );
  }
}

/**
 * Pasarela de pago (decidida: Mercado Pago, con tarjetas y Yape; ADR en docs/architecture.md).
 * El backend nunca recibe datos de tarjeta: la app los tokeniza con el SDK de la pasarela.
 */
export interface PaymentGatewayPort {
  /** El cliente de la pasarela del usuario; lo crea si no existe. */
  ensureCustomer(email: string): Promise<string>;
  /** Guarda en el cliente la tarjeta del token de un solo uso. Rechaza con CardRejectedError. */
  saveCard(customerId: string, cardToken: string): Promise<GatewayCard>;
  deleteCard(customerId: string, cardId: string): Promise<void>;
  charge(request: ChargeRequest): Promise<GatewayPayment>;
  getPayment(paymentId: string): Promise<GatewayPayment>;
}
