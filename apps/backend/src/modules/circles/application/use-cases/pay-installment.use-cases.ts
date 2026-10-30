import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { ConflictError, NotFoundError } from '../../../../shared/errors/app-error';
import {
  type GatewayPayment,
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from '../../../payments/application/ports/payment-gateway.port';
import {
  ChargeInstallmentUseCase,
  type PayInMethod,
  PaymentRejectedError,
} from '../../../payments/application/use-cases/charge-installment.use-case';
import { CircleCycle } from '../../domain/entities/circle-cycle';
import { type SlotPricing } from '../../domain/services/slot-pricing';
import {
  CIRCLE_CYCLE_REPOSITORY,
  type CircleCycleRepositoryPort,
} from '../ports/circle-cycle-repository.port';
import { PAYMENTS_QUERY, type PaymentsQueryPort } from '../ports/payments-query.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { SLOT_PRICING } from './get-available-slots.use-case';

/** La cuota no se puede pagar: ya está pagada, la cubre el fondo o la retención, o fue expulsado. */
export class InstallmentNotPayableError extends ConflictError {
  constructor() {
    super('INSTALLMENT_NOT_PAYABLE', 'Esta cuota ya no se puede pagar');
  }
}

export type PaidOutcome = 'paid' | 'already_paid' | 'not_payable';

/**
 * Marca pagada una cuota cobrada fuera del débito automático (pago desde la app o webhook), con
 * el círculo bloqueado como la tarea diaria. Idempotente.
 */
@Injectable()
export class InstallmentSettlement {
  private readonly logger = new Logger('CircleCycle');

  constructor(
    @Inject(CIRCLE_CYCLE_REPOSITORY) private readonly cycles: CircleCycleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_CYCLE) private readonly settings: CircleCycleSettings,
  ) {}

  async markPaid(circleId: string, installmentId: string, paymentId: string): Promise<PaidOutcome> {
    let outcome: PaidOutcome = 'not_payable';
    await this.cycles.withLock(
      circleId,
      (stored) => {
        const cycle = CircleCycle.restore({
          ...stored,
          dueDay: this.settings.dueDay,
          delinquency: this.settings.delinquency,
          fund: { balance: stored.fundBalance, feeShareBps: this.settings.fundFeeShareBps },
          members: stored.members.map(({ userId, position, price, deductPayIn }) => ({
            userId,
            position,
            quote: this.pricing.quoteOf(stored.terms, position, price),
            deductPayInFromPayout: deductPayIn ?? false,
          })),
        });
        const installment = cycle.installments.find(({ id }) => id === installmentId);
        if (installment?.status === 'paid') outcome = 'already_paid';
        else if (installment?.status === 'pending' || installment?.status === 'overdue') {
          cycle.recordCollection(installmentId, 'paid');
          outcome = 'paid';
        }
        return Promise.resolve(cycle);
      },
      { wait: true },
    );
    const entry = { circleId, installmentId, paymentId, source: 'pay_in' };
    // Un pago que llega para una cuota que ya no se cobra (expulsado, mes cerrado) se revisa a mano.
    if (outcome === 'not_payable') {
      this.logger.warn({ event: 'circles.cycle.payment_unmatched', ...entry });
    } else {
      this.logger.log({ event: 'circles.cycle.installment_paid', ...entry });
    }
    return outcome;
  }
}

export interface PayInstallmentResult {
  /** `pending`: la pasarela lo procesa; la cuota se marca pagada cuando llegue el webhook. */
  status: 'paid' | 'pending';
  paymentId: string;
}

/**
 * `POST /v1/me/installments/:id/pay` (COPAYNI-63): paga desde la app una cuota pendiente o vencida
 * en gracia, con Yape (pide OTP en cada pago) o con una tarjeta guardada.
 */
@Injectable()
export class PayInstallmentUseCase {
  constructor(
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(ChargeInstallmentUseCase) private readonly charge: ChargeInstallmentUseCase,
    @Inject(InstallmentSettlement) private readonly settlement: InstallmentSettlement,
  ) {}

  async execute(
    principal: Principal,
    command: { installmentId: string; idempotencyKey: string; method: PayInMethod },
  ): Promise<PayInstallmentResult> {
    const installment = await this.payments.installment(command.installmentId);
    if (!installment || installment.userId !== principal.userId) {
      throw new NotFoundError('No se encontró la cuota', 'INSTALLMENT_NOT_FOUND');
    }
    if (installment.expelled || !['pending', 'overdue'].includes(installment.status)) {
      throw new InstallmentNotPayableError();
    }
    const payment = await this.charge.execute({
      installmentId: installment.id,
      userId: principal.userId,
      amount: installment.amount,
      description: `Ayni: cuota de ${installment.period.toString()}`,
      idempotencyKey: command.idempotencyKey,
      method: command.method,
    });
    if (payment.status === 'rejected') throw new PaymentRejectedError(payment.statusDetail);
    if (payment.status === 'pending') return { status: 'pending', paymentId: payment.id };
    await this.settlement.markPaid(installment.circleId, installment.id, payment.id);
    return { status: 'paid', paymentId: payment.id };
  }
}

/**
 * Webhook de Mercado Pago (COPAYNI-63): ya verificada la firma, consulta el pago en la pasarela
 * (nunca confía en el cuerpo) y, si está aprobado, marca pagada la cuota de su
 * `external_reference`. Idempotente: los reintentos no cambian nada.
 */
@Injectable()
export class ReconcilePaymentUseCase {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(InstallmentSettlement) private readonly settlement: InstallmentSettlement,
  ) {}

  async execute(paymentId: string): Promise<PaidOutcome | 'ignored'> {
    const payment: GatewayPayment = await this.gateway.getPayment(paymentId);
    const installment = payment.externalReference
      ? await this.payments.installment(payment.externalReference)
      : null;
    if (payment.status !== 'approved' || !installment) {
      this.logger.log({
        event: 'payments.webhook.ignored',
        paymentId,
        status: payment.status,
        matched: installment !== null,
      });
      return 'ignored';
    }
    return this.settlement.markPaid(installment.circleId, installment.id, payment.id);
  }
}
