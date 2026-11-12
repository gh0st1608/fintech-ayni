import {
  type ApprovalStatus,
  type StaffActor,
  type StaffApproval,
} from '../../domain/staff-approval';

export const STAFF_APPROVALS = Symbol('STAFF_APPROVALS');
export const STAFF_APPROVAL_SETTINGS = Symbol('STAFF_APPROVAL_SETTINGS');

export interface StaffApprovalSettings {
  /** Cuánto vive una propuesta sin decidir. */
  readonly ttlHours: number;
}

export interface ApprovalsFilter {
  status?: ApprovalStatus;
  limit: number;
  cursor: string | null;
  now: Date;
}

/** Propuestas de doble aprobación (`staff_approvals`): no se borran ni se editan sus datos. */
export interface StaffApprovalsPort {
  create(approval: StaffApproval): Promise<StaffApproval>;
  find(id: string): Promise<StaffApproval | null>;
  list(filter: ApprovalsFilter): Promise<{ items: StaffApproval[]; nextCursor: string | null }>;
  /**
   * Cierra una pendiente y vigente. Devuelve la propuesta decidida, o `null` si ya no estaba
   * pendiente o venció (otra persona se adelantó).
   */
  decide(props: {
    id: string;
    status: 'approved' | 'rejected';
    by: StaffActor;
    at: Date;
    reason: string | null;
  }): Promise<StaffApproval | null>;
  /** Devuelve a pendiente una aprobada cuyo movimiento no se pudo registrar (compensación). */
  reopen(id: string): Promise<void>;
}
