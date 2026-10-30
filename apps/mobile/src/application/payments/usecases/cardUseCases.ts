import type { CardDetails } from '@/domain/payments/CardDetails';
import type {
  InstallmentPaymentMethod,
  InstallmentPaymentResult,
} from '@/domain/payments/InstallmentPayment';
import type { CardRepositoryPort } from '@/domain/payments/ports/CardRepositoryPort';
import type { PaymentTokenizerPort } from '@/domain/payments/ports/CardTokenizerPort';
import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { SavedCard } from '@/domain/payments/SavedCard';

/** Tarjetas guardadas (COPAYNI-39). */
export class ListCardsUseCase {
  constructor(private readonly cards: CardRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<SavedCard[]> {
    return this.cards.list(signal);
  }
}

/**
 * Agrega una tarjeta (COPAYNI-40): la tokeniza en la pasarela y guarda solo el token. La clave
 * de idempotencia es una por formulario: un reintento no guarda la tarjeta dos veces.
 */
export class AddCardUseCase {
  constructor(
    private readonly tokenizer: PaymentTokenizerPort,
    private readonly cards: CardRepositoryPort,
  ) {}

  async execute(card: CardDetails, idempotencyKey: string): Promise<SavedCard> {
    const token = await this.tokenizer.tokenizeCard(card);
    return this.cards.add(token, idempotencyKey);
  }
}

export class SetDefaultCardUseCase {
  constructor(private readonly cards: CardRepositoryPort) {}

  execute(cardId: string): Promise<SavedCard[]> {
    return this.cards.setDefault(cardId);
  }
}

export class RemoveCardUseCase {
  constructor(private readonly cards: CardRepositoryPort) {}

  execute(cardId: string): Promise<void> {
    return this.cards.remove(cardId);
  }
}

/**
 * Paga una cuota desde la app (COPAYNI-63): con Yape tokeniza el celular y el OTP en la
 * pasarela; con tarjeta usa una guardada.
 */
export class PayInstallmentUseCase {
  constructor(
    private readonly tokenizer: PaymentTokenizerPort,
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async execute(
    installmentId: string,
    payment: InstallmentPaymentMethod,
    idempotencyKey: string,
  ): Promise<InstallmentPaymentResult> {
    if (payment.method === 'card') {
      return this.payments.payInstallment(
        installmentId,
        { method: 'card', cardId: payment.cardId },
        idempotencyKey,
      );
    }
    const token = await this.tokenizer.tokenizeYape({
      phoneNumber: payment.phoneNumber,
      otp: payment.otp,
    });
    return this.payments.payInstallment(installmentId, { method: 'yape', token }, idempotencyKey);
  }
}
