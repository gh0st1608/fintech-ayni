import { digitsOnly, type CardDetails } from '@/domain/payments/CardDetails';
import type { PaymentTokenizerPort } from '@/domain/payments/ports/CardTokenizerPort';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Tarjeta de prueba que la pasarela falsa rechaza, como las de prueba de Mercado Pago. */
export const FAKE_REJECTED_CARD = '4000000000000002';
/** Código de Yape que la pasarela falsa acepta. */
export const FAKE_YAPE_OTP = '123456';

/**
 * Pasarela simulada (solo dev y pruebas): Mercado Pago queda simulado hasta usar la cuenta
 * sandbox. El token codifica lo que la tarjeta falsa del backend necesita (marca y últimos
 * cuatro), nunca el número completo.
 */
export class FakePaymentTokenizer implements PaymentTokenizerPort {
  private readonly latencyMs: number;

  constructor(options: { latencyMs?: number } = {}) {
    this.latencyMs = options.latencyMs ?? 300;
  }

  async tokenizeCard(card: CardDetails): Promise<string> {
    await simulateLatency(this.latencyMs);
    const number = digitsOnly(card.number);
    if (number === FAKE_REJECTED_CARD) {
      throw new AppError('business', 'Card rejected', { code: 'CARD_REJECTED' });
    }
    const brand = number.startsWith('4') ? 'visa' : number.startsWith('5') ? 'master' : 'amex';
    return `fake-${brand}-${number.slice(-4)}-${card.expirationMonth}-${card.expirationYear}`;
  }

  async tokenizeYape(payment: { phoneNumber: string; otp: string }): Promise<string> {
    await simulateLatency(this.latencyMs);
    if (payment.otp !== FAKE_YAPE_OTP) {
      throw new AppError('business', 'Yape rejected', { code: 'YAPE_REJECTED' });
    }
    return `fake-yape-${Date.now()}`;
  }
}

/**
 * Sin pasarela configurada (staging y prod mientras Mercado Pago está simulado): no se puede
 * agregar tarjetas ni pagar con Yape, con un error explicable.
 */
export class UnconfiguredPaymentTokenizer implements PaymentTokenizerPort {
  tokenizeCard(): Promise<string> {
    return Promise.reject(this.error());
  }

  tokenizeYape(): Promise<string> {
    return Promise.reject(this.error());
  }

  private error(): AppError {
    return new AppError('business', 'Payment gateway not configured', {
      code: 'GATEWAY_NOT_CONFIGURED',
    });
  }
}
