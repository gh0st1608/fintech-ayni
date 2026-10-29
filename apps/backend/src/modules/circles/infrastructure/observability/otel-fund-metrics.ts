import { metrics } from '@opentelemetry/api';

import { type FundMetricsPort, type FundStatus } from '../../application/ports/guarantee-fund.port';
import { type Money } from '../../../../shared/domain/value-objects/money';

/**
 * Métricas del fondo de garantía en el MeterProvider global (telemetry.ts): saldo, mínimo y si
 * está debajo, por moneda. Sin telemetría configurada, la API de OpenTelemetry no hace nada.
 */
export class OtelFundMetrics implements FundMetricsPort {
  private readonly meter = metrics.getMeter('ayni.circles');
  private readonly balance = this.meter.createGauge('ayni.guarantee_fund.balance', {
    description: 'Saldo del fondo de garantía, en unidades menores',
  });
  private readonly minimum = this.meter.createGauge('ayni.guarantee_fund.minimum', {
    description: 'Saldo mínimo del fondo: cuotas base por círculo en curso',
  });
  private readonly belowMinimum = this.meter.createCounter('ayni.guarantee_fund.below_minimum', {
    description: 'Veces que el fondo quedó debajo del saldo mínimo',
  });

  report(status: FundStatus & { minimum: Money; belowMinimum: boolean }): void {
    const attributes = { currency: status.balance.currency };
    this.balance.record(status.balance.amount, attributes);
    this.minimum.record(status.minimum.amount, attributes);
    if (status.belowMinimum) this.belowMinimum.add(1, attributes);
  }
}
