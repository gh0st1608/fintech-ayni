import type { Money } from '../circles/Circle';

/** Estados de una cuota mensual, como los define el backend (ciclo mensual). */
export const INSTALLMENT_STATUSES = [
  'pending',
  'paid',
  'overdue',
  'defaulted',
  'retained',
  'deducted',
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** Persona con el nombre enmascarado: finanzas no ve email ni teléfono. */
export interface FinanceMember {
  userId: string;
  name: string | null;
}

export interface Installment {
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

export interface InstallmentTotal {
  status: InstallmentStatus;
  count: number;
  total: Money;
}

export interface InstallmentsPage {
  totals: InstallmentTotal[];
  items: Installment[];
  nextCursor: string | null;
}

export interface Payout {
  id: string;
  circleId: string;
  position: number;
  period: string;
  amount: Money;
  disbursedAt: Date;
  member: FinanceMember;
}

export interface PayoutsPage {
  items: Payout[];
  nextCursor: string | null;
}

export interface FundBalance {
  balance: Money;
  activeCircles: number;
  minimum: Money;
  belowMinimum: boolean;
}

export interface FundMovement {
  transactionKey: string;
  kind: string;
  circleId: string | null;
  period: string | null;
  reason: string | null;
  /** Positivo entra al fondo; negativo sale. */
  amount: Money;
  createdAt: Date;
}

export interface GuaranteeFund {
  balances: FundBalance[];
  items: FundMovement[];
  nextCursor: string | null;
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  overdue: 'Vencida',
  defaulted: 'Impaga',
  retained: 'Retenida del pozo',
  deducted: 'Descontada del pozo',
};

/** Movimientos del registro contable; un tipo que esta versión no conoce se muestra tal cual. */
export const FUND_MOVEMENT_LABELS: Record<string, string> = {
  fund_contribution: 'Aporte de las cuotas',
  coverage: 'Cobertura de una cuota',
  seed_capital: 'Capital semilla',
  adjustment: 'Corrección',
  debt_recovered: 'Deuda recuperada',
  fund_debt_to_member: 'Deuda con un miembro',
  retention_to_fund: 'Retención al fondo',
  penalty: 'Cargo por mora',
};

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mes `AAAA-MM`, el formato que acepta el backend para filtrar cuotas. */
export function isPeriod(value: string): boolean {
  return PERIOD.test(value);
}
