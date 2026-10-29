import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../ports/payment-gateway.port';
import { SAVED_CARDS, type SavedCardRepositoryPort } from '../ports/saved-card-repository.port';

export const AUTO_DEBIT_SETTINGS = Symbol('AUTO_DEBIT_SETTINGS');

export interface AutoDebitSettings {
  /** Zona horaria del negocio: un intento de cobro por día. */
  timeZone: string;
}

export interface AutoDebitRequest {
  /** Id de la cuota: es la referencia externa del pago. */
  installmentId: string;
  userId: string;
  amount: Money;
  description: string;
}

/**
 * Débito automático de una cuota con la tarjeta predeterminada del usuario (COPAYNI-40, pasarela
 * Mercado Pago). Devuelve `true` si la cuota quedó pagada.
 * - Sin tarjeta guardada (p. ej. paga con Yape, que pide OTP en cada pago) no se cobra.
 * - Antes de cobrar busca los pagos de la cuota: uno aprobado la da por pagada y uno pendiente no
 *   se vuelve a cobrar, así un reintento no cobra dos veces.
 * - Un intento por día: la clave de idempotencia es la cuota y la fecha.
 */
@Injectable()
export class CollectInstallmentUseCase {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(SAVED_CARDS) private readonly cards: SavedCardRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTO_DEBIT_SETTINGS) private readonly settings: AutoDebitSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(request: AutoDebitRequest): Promise<boolean> {
    const { installmentId, userId } = request;
    const previous = await this.gateway.paymentsFor(installmentId);
    if (previous.some(({ status }) => status === 'approved')) return true;
    if (previous.some(({ status }) => status === 'pending')) return false;

    const [card] = (await this.cards.list(userId)).filter(({ isDefault }) => isDefault);
    const customerId = await this.cards.customerOf(userId);
    const user = await this.users.findById(userId);
    if (!card || !customerId || !user?.email) {
      this.logger.log({ event: 'payments.auto_debit.skipped', userId, installmentId });
      return false;
    }
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone);
    const payment = await this.gateway.charge({
      idempotencyKey: `${installmentId}:${today.toString()}`,
      amount: request.amount,
      description: request.description,
      payerEmail: user.email,
      externalReference: installmentId,
      source: { type: 'card', customerId, cardId: card.gatewayCardId, brand: card.brand },
    });
    this.logger.log({
      event: 'payments.auto_debit.charged',
      userId,
      installmentId,
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.statusDetail,
    });
    return payment.status === 'approved';
  }
}
