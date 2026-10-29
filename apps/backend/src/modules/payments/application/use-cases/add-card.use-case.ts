import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { DomainError, NotFoundError } from '../../../../shared/errors/app-error';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../ports/payment-gateway.port';
import {
  SAVED_CARDS,
  type SavedCard,
  type SavedCardRepositoryPort,
} from '../ports/saved-card-repository.port';

/** Mercado Pago identifica al cliente por email: un usuario solo con teléfono no tiene. */
export class EmailRequiredError extends DomainError {
  constructor() {
    super('EMAIL_REQUIRED', 'Agrega un email a tu cuenta para guardar una tarjeta');
  }
}

export interface AddCardResult {
  card: SavedCard;
  /** false si es un reintento con la misma clave. */
  created: boolean;
}

/**
 * Guarda una tarjeta (COPAYNI-40). La app la tokeniza con el SDK de la pasarela: aquí solo llega
 * el token de un solo uso, nunca el PAN ni el CVC. Un reintento con la misma `Idempotency-Key`
 * responde la tarjeta ya guardada sin volver a la pasarela (el token ya se usó).
 */
@Injectable()
export class AddCardUseCase {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(
    principal: Principal,
    command: { token: string; idempotencyKey: string },
  ): Promise<AddCardResult> {
    const { userId } = principal;
    const previous = await this.cards.findByIdempotencyKey(userId, command.idempotencyKey);
    if (previous) return { card: previous, created: false };

    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    if (!user.email) throw new EmailRequiredError();
    let customerId = await this.cards.customerOf(userId);
    if (!customerId) {
      customerId = await this.gateway.ensureCustomer(user.email);
      await this.cards.saveCustomer(userId, customerId);
    }
    const gatewayCard = await this.gateway.saveCard(customerId, command.token);
    const card = await this.cards.add(userId, gatewayCard, command.idempotencyKey);
    // Sin datos de la tarjeta en el log: solo su id interno y la marca.
    this.logger.log({ event: 'payments.card_added', userId, cardId: card.id, brand: card.brand });
    return { card, created: true };
  }
}

/** `GET /v1/me/cards` (COPAYNI-39 y 40). */
@Injectable()
export class ListCardsUseCase {
  constructor(@Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort) {}

  execute(principal: Principal): Promise<SavedCard[]> {
    return this.cards.list(principal.userId);
  }
}
