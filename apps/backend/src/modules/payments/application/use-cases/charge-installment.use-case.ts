import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Money } from '../../../../shared/domain/value-objects/money';
import { ConflictError, DomainError, NotFoundError } from '../../../../shared/errors/app-error';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import {
  type ChargeSource,
  type GatewayPayment,
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import { SAVED_CARDS, type SavedCardRepositoryPort } from '../ports/saved-card-repository.port';
import { EmailRequiredError } from './add-card.use-case';

/** Con qué paga el usuario la cuota desde la app (COPAYNI-63). */
export type PayInMethod = { type: 'yape'; token: string } | { type: 'card'; cardId: string };

export class PaymentRejectedError extends DomainError {
  constructor(detail: string | null) {
    super('PAYMENT_REJECTED', 'La pasarela rechazó el pago', detail ? { detail } : undefined);
  }
}

/** Ya hay un pago de esta cuota en proceso: se confirma por webhook. */
export class PaymentPendingError extends ConflictError {
  constructor() {
    super('PAYMENT_PENDING', 'Ya hay un pago de esta cuota en proceso');
  }
}

/**
 * Cobra una cuota con Yape o con una tarjeta guardada (COPAYNI-63). Antes de cobrar busca los
 * pagos de la cuota: uno aprobado se devuelve sin volver a cobrar (p. ej. el débito automático ya
 * la cobró) y uno pendiente responde PAYMENT_PENDING. Un reintento con la misma clave no cobra dos
 * veces.
 */
@Injectable()
export class ChargeInstallmentUseCase {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(request: {
    installmentId: string;
    userId: string;
    amount: Money;
    description: string;
    idempotencyKey: string;
    method: PayInMethod;
  }): Promise<GatewayPayment> {
    const { installmentId, userId, method } = request;
    const previous = await this.gateway.paymentsFor(installmentId);
    const approved = previous.find(({ status }) => status === 'approved');
    if (approved) return approved;
    if (previous.some(({ status }) => status === 'pending')) throw new PaymentPendingError();

    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    if (!user.email) throw new EmailRequiredError();
    let source: ChargeSource;
    if (method.type === 'yape') {
      source = { type: 'yape', token: method.token };
    } else {
      const card = (await this.cards.list(userId)).find(({ id }) => id === method.cardId);
      const customerId = await this.cards.customerOf(userId);
      if (!card || !customerId) {
        throw new NotFoundError('No se encontró la tarjeta', 'CARD_NOT_FOUND');
      }
      source = { type: 'card', customerId, cardId: card.gatewayCardId, brand: card.brand };
    }
    const payment = await this.gateway.charge({
      idempotencyKey: `${installmentId}:${request.idempotencyKey}`,
      amount: request.amount,
      description: request.description,
      payerEmail: user.email,
      externalReference: installmentId,
      source,
    });
    this.logger.log({
      event: 'payments.pay_in.charged',
      userId,
      installmentId,
      method: method.type,
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.statusDetail,
    });
    return payment;
  }
}
