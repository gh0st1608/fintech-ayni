import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  FUND_METRICS,
  type FundMetricsPort,
  type FundStatus,
  GUARANTEE_FUND,
  type GuaranteeFundPort,
} from '../ports/guarantee-fund.port';

export const GUARANTEE_FUND_SETTINGS = Symbol('GUARANTEE_FUND_SETTINGS');

export interface GuaranteeFundSettings {
  /** Cuotas base por círculo en curso que el fondo debe tener (R18, propuesto: 2). */
  minInstallmentsPerCircle: number;
}

/**
 * Alerta de saldo mínimo del fondo (COPAYNI-58, R18): el saldo debe cubrir
 * `minInstallmentsPerCircle` cuotas base por círculo en curso. Debajo de ese umbral se alerta al
 * admin general con un log y la métrica. La ejecuta la tarea diaria después del ciclo.
 */
@Injectable()
export class CheckGuaranteeFundUseCase {
  private readonly logger = new Logger('GuaranteeFund');

  constructor(
    @Inject(GUARANTEE_FUND) private readonly fund: GuaranteeFundPort,
    @Inject(FUND_METRICS) private readonly metrics: FundMetricsPort,
    @Inject(GUARANTEE_FUND_SETTINGS) private readonly settings: GuaranteeFundSettings,
  ) {}

  async execute(): Promise<(FundStatus & { belowMinimum: boolean })[]> {
    const statuses = await this.fund.status();
    return statuses.map((status) => {
      const minimum = status.activeBaseInstallments.times(this.settings.minInstallmentsPerCircle);
      const belowMinimum = status.balance.amount < minimum.amount;
      this.metrics.report({ ...status, minimum, belowMinimum });
      const summary = {
        currency: status.balance.currency,
        balance: status.balance.amount,
        minimum: minimum.amount,
        activeCircles: status.activeCircles,
      };
      if (belowMinimum) {
        this.logger.warn({ event: 'guarantee_fund.below_minimum', ...summary });
      } else {
        this.logger.log({ event: 'guarantee_fund.status', ...summary });
      }
      return { ...status, belowMinimum };
    });
  }
}
