import type { CardDetails } from '../CardDetails';

/**
 * Tokenización en la pasarela (Mercado Pago, COPAYNI-34): la app manda la tarjeta o el pago de
 * Yape directo a la pasarela y recibe un token de un solo uso; el backend solo recibe el token.
 */
export interface PaymentTokenizerPort {
  tokenizeCard(card: CardDetails): Promise<string>;
  /** Celular de Yape y el código que muestra la app de Yape. */
  tokenizeYape(payment: { phoneNumber: string; otp: string }): Promise<string>;
}
