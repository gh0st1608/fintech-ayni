import { ConflictError, ForbiddenError } from '../../../shared/errors/app-error';

/**
 * Doble aprobación ("4-eyes") de lo que mueve dinero (COPAYNI-73). Una persona del personal
 * propone y **otra** aprueba con autenticación reciente; recién entonces se ejecuta. Regla
 * provisional mientras se decide BO6: aplica a los movimientos manuales del fondo de garantía y la
 * pueden proponer y aprobar `finance` y `super_admin`.
 */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ACTIONS = ['guarantee_fund.movement'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const FUND_MOVEMENT_KINDS = ['seed_capital', 'adjustment'] as const;
export type FundMovementKind = (typeof FUND_MOVEMENT_KINDS)[number];

/** Lo que se ejecutará al aprobar: un movimiento del fondo, en unidades menores. */
export interface FundMovementProposal {
  kind: FundMovementKind;
  amount: number;
  currency: string;
  reason: string;
}

export interface StaffActor {
  staffId: string;
  email: string | null;
}

export interface StaffApproval {
  id: string;
  action: ApprovalAction;
  payload: FundMovementProposal;
  status: ApprovalStatus;
  proposedBy: StaffActor;
  proposedAt: Date;
  expiresAt: Date;
  decidedBy: StaffActor | null;
  decidedAt: Date | null;
  /** Motivo del rechazo; `null` si se aprobó o sigue pendiente. */
  decisionReason: string | null;
}

/** Una pendiente vencida se informa como `expired` aunque nadie la haya cerrado todavía. */
export function effectiveStatus(approval: StaffApproval, now: Date): ApprovalStatus {
  return approval.status === 'pending' && approval.expiresAt <= now ? 'expired' : approval.status;
}

/** Misma persona: mismo id del proveedor o, si ambos lo traen, el mismo email. */
export function sameStaff(a: StaffActor, b: StaffActor): boolean {
  if (a.staffId === b.staffId) return true;
  return a.email !== null && b.email !== null && a.email.toLowerCase() === b.email.toLowerCase();
}

export class ApprovalNotPendingError extends ConflictError {
  constructor(status: ApprovalStatus) {
    super('APPROVAL_NOT_PENDING', 'Esta propuesta ya no está pendiente', { status });
  }
}

export class SelfApprovalError extends ForbiddenError {
  constructor() {
    super('No puedes aprobar ni rechazar una propuesta tuya', 'APPROVAL_SELF_DECISION');
  }
}
