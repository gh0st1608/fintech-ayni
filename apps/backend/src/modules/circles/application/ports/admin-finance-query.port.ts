import { type Money } from '../../../../shared/domain/value-objects/money';
import { type InstallmentStatus } from '../../domain/entities/circle-cycle';
import { type CadenceId } from '../../domain/value-objects/cadence';

export const ADMIN_FINANCE_QUERY = Symbol('ADMIN_FINANCE_QUERY');

/** Persona tal como se guarda; la aplicación la enmascara antes de exponerla. */
export interface FinanceMember {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

/** Una cuota de un miembro (docs/backoffice-plan.md, fase 3). */
export interface AdminInstallment {
  id: string;
  circleId: string;
  position: number;
  /**
   * Turno del ciclo al que corresponde la cuota, y cadencia de la junta (COPAYNI-118). El mes no
   * identifica la cuota fuera de la cadencia mensual: en una semanal hay cuatro en el mismo mes.
   */
  turn: number;
  cadence: CadenceId;
  /** `YYYY-MM`. */
  period: string;
  /** `YYYY-MM-DD`. */
  dueOn: string;
  amount: Money;
  status: InstallmentStatus;
  paidAt: Date | null;
  member: FinanceMember;
}

/** Un pozo entregado. */
export interface AdminPayout {
  id: string;
  circleId: string;
  position: number;
  turn: number;
  cadence: CadenceId;
  period: string;
  amount: Money;
  disbursedAt: Date;
  member: FinanceMember;
}

/** Un movimiento del fondo de garantía, con el motivo de la transacción si es manual. */
export interface FundMovement {
  transactionKey: string;
  kind: string;
  circleId: string | null;
  /** Cadencia de la junta del movimiento; `null` en los movimientos manuales sin junta. */
  cadence: CadenceId | null;
  period: string | null;
  reason: string | null;
  amount: Money;
  createdAt: Date;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface InstallmentsFilter {
  status?: InstallmentStatus;
  /** `YYYY-MM`. */
  period?: string;
  /** Solo las cuotas de juntas de esta cadencia (COPAYNI-118). */
  cadence?: CadenceId;
  limit: number;
  cursor: string | null;
}

/**
 * Totales de cuotas por estado **y cadencia** (COPAYNI-118).
 *
 * La cadencia entra en el agrupamiento porque una vista por mes mezcla una junta mensual con
 * cuatro semanas de otra: la cifra sale sumada y la conciliación deja de cuadrar a simple vista.
 * Con solo juntas mensuales hay una fila por estado, como antes.
 */
export interface InstallmentTotal {
  status: InstallmentStatus;
  cadence: CadenceId;
  count: number;
  total: Money;
}

/** Aporte y uso del fondo de garantía, por cadencia (COPAYNI-118). */
export interface FundTotal {
  cadence: CadenceId | null;
  /** Lo que entró al fondo. */
  contributed: Money;
  /** Lo que salió del fondo. */
  used: Money;
}

export interface AdminFinanceQueryPort {
  /** Cantidad y suma por estado y cadencia, para el resumen. */
  installmentTotals(period?: string, cadence?: CadenceId): Promise<InstallmentTotal[]>;
  /** Aporte y uso del fondo de garantía por cadencia. */
  fundTotals(): Promise<FundTotal[]>;
  installments(filter: InstallmentsFilter): Promise<Page<AdminInstallment>>;
  payouts(filter: { limit: number; cursor: string | null }): Promise<Page<AdminPayout>>;
  fundMovements(filter: { limit: number; cursor: string | null }): Promise<Page<FundMovement>>;
}
