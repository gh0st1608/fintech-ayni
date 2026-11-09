import { type Money } from '../../../../shared/domain/value-objects/money';
import { type InstallmentStatus } from '../../domain/entities/circle-cycle';

export const ADMIN_FINANCE_QUERY = Symbol('ADMIN_FINANCE_QUERY');

/** Persona tal como se guarda; la aplicación la enmascara antes de exponerla. */
export interface FinanceMember {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

/** Una cuota mensual de un miembro (docs/backoffice-plan.md, fase 3). */
export interface AdminInstallment {
  id: string;
  circleId: string;
  position: number;
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
  limit: number;
  cursor: string | null;
}

export interface AdminFinanceQueryPort {
  /** Cantidad y suma por estado, para el resumen. */
  installmentTotals(
    period?: string,
  ): Promise<{ status: InstallmentStatus; count: number; total: Money }[]>;
  installments(filter: InstallmentsFilter): Promise<Page<AdminInstallment>>;
  payouts(filter: { limit: number; cursor: string | null }): Promise<Page<AdminPayout>>;
  fundMovements(filter: { limit: number; cursor: string | null }): Promise<Page<FundMovement>>;
}
