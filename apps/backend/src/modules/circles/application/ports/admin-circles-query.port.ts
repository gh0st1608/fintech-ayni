import { type Money } from '../../../../shared/domain/value-objects/money';
import { type CycleState } from '../../domain/entities/circle-cycle';

export const ADMIN_CIRCLES_QUERY = Symbol('ADMIN_CIRCLES_QUERY');

/** Una fila del listado de círculos del back-office (docs/backoffice-plan.md, fase 2). */
export interface AdminCircleSummary {
  circleId: string;
  state: CycleState;
  payout: Money;
  months: number;
  /** `YYYY-MM`. */
  startsOn: string;
  /** Miembros vigentes (sin expulsados) frente a `months`. */
  members: number;
  createdAt: Date;
}

export interface AdminCirclesPage {
  items: AdminCircleSummary[];
  nextCursor: string | null;
}

/** Datos de un miembro tal como se guardan; la aplicación los enmascara antes de exponerlos. */
export interface AdminCircleMember {
  userId: string;
  position: number;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  joinedAt: Date;
  expelledAt: Date | null;
}

export interface AdminStartProposal {
  round: number;
  payout: Money;
  months: number;
  /** `YYYY-MM-DD`. */
  respondBy: string;
  accepted: number;
  withdrawn: number;
}

export interface AdminCircleDetail extends AdminCircleSummary {
  /** Mes en curso del ciclo, `YYYY-MM`, si ya empezó. */
  currentPeriod: string | null;
  /** `YYYY-MM-DD`, si está pausado. */
  pausedOn: string | null;
  memberships: AdminCircleMember[];
  startProposal: AdminStartProposal | null;
}

export interface AdminCirclesFilter {
  state?: CycleState;
  limit: number;
  cursor: string | null;
}

export interface AdminCirclesQueryPort {
  list(filter: AdminCirclesFilter): Promise<AdminCirclesPage>;
  find(circleId: string): Promise<AdminCircleDetail | null>;
}
