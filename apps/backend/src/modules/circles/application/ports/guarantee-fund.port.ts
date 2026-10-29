import { type Money } from '../../../../shared/domain/value-objects/money';
import { type LedgerTransaction } from '../../domain/value-objects/ledger-transaction';

export const GUARANTEE_FUND = Symbol('GUARANTEE_FUND');
export const FUND_METRICS = Symbol('FUND_METRICS');

/** Saldo del fondo en una moneda y lo que necesita para los círculos en curso. */
export interface FundStatus {
  balance: Money;
  activeCircles: number;
  /** Suma de la cuota base de los círculos en curso. */
  activeBaseInstallments: Money;
}

/** Registro contable del fondo de garantía (COPAYNI-58): solo inserción. */
export interface GuaranteeFundPort {
  /** Una por moneda con saldo o con círculos en curso. */
  status(): Promise<FundStatus[]>;
  /** Guarda el movimiento; `false` si ya existía uno con esa clave (no lo duplica). */
  record(transaction: LedgerTransaction): Promise<boolean>;
}

/** Métricas del fondo para el admin general (alerta de saldo mínimo). */
export interface FundMetricsPort {
  report(status: FundStatus & { minimum: Money; belowMinimum: boolean }): void;
}
