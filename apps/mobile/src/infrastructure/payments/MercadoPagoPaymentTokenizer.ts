import { digitsOnly, type CardDetails } from '@/domain/payments/CardDetails';
import type { PaymentTokenizerPort } from '@/domain/payments/ports/CardTokenizerPort';
import { AppError } from '@/domain/shared/errors/AppError';
import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface MercadoPagoTokenizerConfig {
  /** Public key de la aplicación de Mercado Pago: no es secreta, pero no va en el repositorio. */
  publicKey: string;
  apiUrl?: string;
  timeoutMs: number;
}

/**
 * Tokenización directa con Mercado Pago (COPAYNI-34 y 63), con la public key: los datos de la
 * tarjeta y el OTP de Yape van de la app a Mercado Pago y nunca al backend ni a los logs. El
 * backend solo recibe el token de un solo uso.
 *
 * - Yape: `POST /platforms/pci/yape/v1/payment` con el celular, el OTP y un `requestId` nuevo por
 *   intento (lo mismo que hace `mp.yape(...)` de MercadoPago.js). El token es el `id` de la
 *   respuesta.
 * - Tarjeta: `POST /v1/card_tokens` con el número, el vencimiento, el CVV y el titular.
 */
export class MercadoPagoPaymentTokenizer implements PaymentTokenizerPort {
  private readonly apiUrl: string;

  constructor(
    private readonly config: MercadoPagoTokenizerConfig,
    private readonly ids: IdGeneratorPort,
    private readonly http: Fetch = (input, init) => fetch(input, init),
  ) {
    this.apiUrl = (config.apiUrl ?? 'https://api.mercadopago.com').replace(/\/$/, '');
  }

  tokenizeYape(payment: { phoneNumber: string; otp: string }): Promise<string> {
    return this.token('/platforms/pci/yape/v1/payment', 'YAPE_REJECTED', {
      phoneNumber: digitsOnly(payment.phoneNumber),
      otp: payment.otp,
      requestId: this.ids.next(),
    });
  }

  tokenizeCard(card: CardDetails): Promise<string> {
    const documentNumber = digitsOnly(card.documentNumber);
    return this.token('/v1/card_tokens', 'CARD_REJECTED', {
      card_number: digitsOnly(card.number),
      expiration_month: card.expirationMonth,
      expiration_year: card.expirationYear,
      security_code: card.securityCode,
      cardholder: {
        name: card.holderName.trim(),
        // Supuesto: 8 dígitos es un DNI; si no, carné de extranjería (`C.E`, de 9 a 12 dígitos).
        identification: {
          type: documentNumber.length === 8 ? 'DNI' : 'C.E',
          number: documentNumber,
        },
      },
    });
  }

  /**
   * Un 4xx es un rechazo de los datos (OTP vencido, tarjeta inválida) y se muestra con `code`;
   * 429 y 5xx son transitorios. El cuerpo de la respuesta nunca se registra.
   */
  private async token(path: string, rejectedCode: string, body: unknown): Promise<string> {
    const url = `${this.apiUrl}${path}?public_key=${encodeURIComponent(this.config.publicKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.http(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new AppError('timeout', 'Payment gateway timed out', { cause });
      }
      throw new AppError('network', 'Payment gateway unreachable', { cause });
    } finally {
      clearTimeout(timer);
    }
    const { status } = response;
    if (status === 429) {
      throw new AppError('rate_limited', 'Payment gateway rate limited', { status });
    }
    if (status >= 500) throw new AppError('server', 'Payment gateway failed', { status });
    if (status >= 400) {
      throw new AppError('business', 'Payment gateway rejected', { status, code: rejectedCode });
    }
    const json = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (typeof json?.id !== 'string' || json.id === '') {
      throw new AppError('unknown', 'Unexpected payment gateway response', { status });
    }
    return json.id;
  }
}
