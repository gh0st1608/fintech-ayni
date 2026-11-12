import type { Money } from '../circles/Circle';

/**
 * Doble aprobación de los movimientos manuales del fondo de garantía (COPAYNI-73). Una persona
 * propone y otra decide; quien propuso no puede aprobar ni rechazar. Regla provisional (BO6).
 */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const FUND_MOVEMENT_KINDS = ['seed_capital', 'adjustment'] as const;
export type FundMovementKind = (typeof FUND_MOVEMENT_KINDS)[number];

export interface StaffRef {
  staffId: string;
  email: string | null;
}

export interface Approval {
  id: string;
  movement: { kind: FundMovementKind; amount: Money; reason: string };
  status: ApprovalStatus;
  proposedBy: StaffRef;
  proposedAt: Date;
  expiresAt: Date;
  decidedBy: StaffRef | null;
  decidedAt: Date | null;
  decisionReason: string | null;
}

export interface ApprovalsPage {
  items: Approval[];
  nextCursor: string | null;
}

export interface FundMovementProposal {
  kind: FundMovementKind;
  /** Unidades menores; negativo solo en una corrección que saca dinero del fondo. */
  amount: number;
  currency: string;
  reason: string;
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Vencida',
};

export const MOVEMENT_KIND_LABELS: Record<FundMovementKind, string> = {
  seed_capital: 'Capital semilla',
  adjustment: 'Corrección',
};

/** Tope del backend: 10 millones en unidades mayores. */
export const MAX_MOVEMENT_MINOR = 1_000_000_000;

/**
 * Monto escrito por la persona ("1500", "-25.50", "1,500.00") a unidades menores, o `null` si no
 * es un monto con hasta 2 decimales.
 */
export function parseAmount(value: string): number | null {
  const clean = value.trim().replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const [, sign, units, cents = ''] = match;
  const minor = Number(units) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return sign ? -minor : minor;
}

/** Misma persona: mismo id del proveedor o el mismo email (como valida el backend). */
export function isSameStaff(a: StaffRef, b: StaffRef): boolean {
  if (a.staffId === b.staffId) return true;
  return a.email !== null && b.email !== null && a.email.toLowerCase() === b.email.toLowerCase();
}
