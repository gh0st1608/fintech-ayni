import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { ConflictError, NotFoundError } from '../../../../shared/errors/app-error';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../ports/payment-gateway.port';
import {
  SAVED_CARDS,
  type SavedCard,
  type SavedCardRepositoryPort,
} from '../ports/saved-card-repository.port';

/** Borrar la predeterminada habiendo otras: primero hay que elegir otra (COPAYNI-39). */
export class DefaultCardReplacementRequiredError extends ConflictError {
  constructor() {
    super(
      'DEFAULT_CARD_REPLACEMENT_REQUIRED',
      'Elige otra tarjeta predeterminada antes de eliminar esta',
    );
  }
}

const cardNotFound = () => new NotFoundError('No se encontró la tarjeta', 'CARD_NOT_FOUND');

/** `PUT /v1/me/cards/:id/default` (COPAYNI-39): con ella se cobran las cuotas. */
@Injectable()
export class SetDefaultCardUseCase {
  constructor(@Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort) {}

  async execute(principal: Principal, cardId: string): Promise<SavedCard[]> {
    if (!(await this.cards.setDefault(principal.userId, cardId))) throw cardNotFound();
    return this.cards.list(principal.userId);
  }
}

/**
 * `DELETE /v1/me/cards/:id` (COPAYNI-39): la retira de Mercado Pago y la marca como borrada.
 * La predeterminada solo se borra si es la única: con otras, primero hay que elegir otra.
 */
@Injectable()
export class RemoveCardUseCase {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async execute(principal: Principal, cardId: string): Promise<void> {
    const { userId } = principal;
    const cards = await this.cards.list(userId);
    const card = cards.find(({ id }) => id === cardId);
    if (!card) throw cardNotFound();
    if (card.isDefault && cards.length > 1) throw new DefaultCardReplacementRequiredError();
    const customerId = await this.cards.customerOf(userId);
    if (customerId) await this.gateway.deleteCard(customerId, card.gatewayCardId);
    await this.cards.remove(userId, cardId);
    this.logger.log({ event: 'payments.card_removed', userId, cardId });
  }
}
