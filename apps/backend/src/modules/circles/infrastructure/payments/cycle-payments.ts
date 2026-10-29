import { Logger } from '@nestjs/common';

import {
  type ContributionsPort,
  type DisbursementsPort,
} from '../../application/ports/cycle-payments.port';
import { type CollectionOutcome } from '../../domain/entities/circle-cycle';

export const CYCLE_PAYMENTS_ADAPTERS = ['fake'] as const;
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
