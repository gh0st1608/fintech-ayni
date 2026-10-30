import { Logger } from '@nestjs/common';

import {
  type ContributionsPort,
  type DisbursementsPort,
} from '../../application/ports/cycle-payments.port';
import { type CollectionOutcome, type Installment } from '../../domain/entities/circle-cycle';
import { type CollectInstallmentUseCase } from '../../../payments/application/use-cases/collect-installment.use-case';
import { type ReferralDiscounts } from '../../application/use-cases/referral-discounts';

export const CYCLE_PAYMENTS_ADAPTERS = ['fake', 'gateway'] as const;
export type CyclePaymentsAdapter = (typeof CYCLE_PAYMENTS_ADAPTERS)[number];

/**
 * Pagos simulados para desarrollo y pruebas, sin pasarela (D1, COPAYNI-34): toda cuota se cobra
 * y todo payout y devolución se paga. La validación de la configuración lo prohíbe en production.
 */
export class FakeCyclePayments implements ContributionsPort, DisbursementsPort {
  private readonly logger = new Logger('FakeCyclePayments');

  collect(): Promise<CollectionOutcome> {
    return Promise.resolve('paid');
  }

  disburse(): Promise<void> {
    this.logger.debug('Payout simulado');
    return Promise.resolve();
  }

  refund(): Promise<void> {
    this.logger.debug('Devolución simulada');
    return Promise.resolve();
  }
}

/** Sin proveedor configurado: el ciclo no puede cobrar ni pagar, y lo dice al intentarlo. */
export class UnconfiguredCyclePayments implements ContributionsPort, DisbursementsPort {
  collect(): Promise<CollectionOutcome> {
    return Promise.reject(UnconfiguredCyclePayments.error());
  }

  disburse(): Promise<void> {
    return Promise.reject(UnconfiguredCyclePayments.error());
  }

  refund(): Promise<void> {
    return Promise.reject(UnconfiguredCyclePayments.error());
  }

  private static error(): Error {
    return new Error(
      'Sin proveedor de pagos del ciclo (CIRCLE_PAYMENTS_ADAPTER; pending-scope D1)',
    );
  }
}

/**
 * Cobro de las cuotas con la pasarela (COPAYNI-34 y 40): débito automático con la tarjeta
 * predeterminada. Si el usuario no tiene tarjeta o el cobro no se aprueba, la cuota queda vencida
 * y se reintenta durante la gracia (COPAYNI-57). Los payouts y las devoluciones todavía no tienen
 * riel: Mercado Pago no documenta transferencias bancarias en Perú (pending-scope T5).
 */
export class GatewayCyclePayments implements ContributionsPort, DisbursementsPort {
  constructor(
    private readonly collectInstallment: CollectInstallmentUseCase,
    private readonly discounts: ReferralDiscounts,
  ) {}

  /** Con saldo de referidos (COPAYNI-53) se cobra la cuota menos el descuento. */
  async collect(installment: Installment & { circleId: string }): Promise<CollectionOutcome> {
    const discount = await this.discounts.quote(installment.userId, installment.amount);
    const paid =
      discount.equals(installment.amount) ||
      (await this.collectInstallment.execute({
        installmentId: installment.id,
        userId: installment.userId,
        amount: installment.amount.subtract(discount),
        description: `Ayni: cuota de ${installment.period.toString()}`,
      }));
    if (paid) await this.discounts.apply(installment, discount);
    return paid ? 'paid' : 'failed';
  }

  disburse(): Promise<void> {
    return Promise.reject(GatewayCyclePayments.noPayoutRail());
  }

  refund(): Promise<void> {
    return Promise.reject(GatewayCyclePayments.noPayoutRail());
  }

  private static noPayoutRail(): Error {
    return new Error('Sin riel de payouts: Mercado Pago no cubre transferencias en Perú (T5)');
  }
}
