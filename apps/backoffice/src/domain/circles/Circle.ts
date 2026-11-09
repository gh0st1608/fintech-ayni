/** Estados del ciclo de una junta, como los define el backend. */
export const CYCLE_STATES = [
  'collecting',
  'approving',
  'contributing',
  'paused',
  'finished',
  'cancelled',
] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

/** Monto en unidades menores (céntimos) y su moneda ISO 4217. */
export interface Money {
  amount: number;
  currency: string;
}

export interface CircleSummary {
  circleId: string;
  state: CycleState;
  payout: Money;
  months: number;
  /** `YYYY-MM`. */
  startsOn: string;
  /** Miembros vigentes, sin expulsados. */
  members: number;
  createdAt: Date;
}

export interface CirclesPage {
  items: CircleSummary[];
  nextCursor: string | null;
}

/** Miembro con sus datos personales ya enmascarados por el backend. */
export interface CircleMember {
  userId: string;
  position: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: Date;
  expelledAt: Date | null;
}

export interface StartProposal {
  round: number;
  payout: Money;
  months: number;
  /** `YYYY-MM-DD`. */
  respondBy: string;
  accepted: number;
  withdrawn: number;
}

export interface CircleDetail extends CircleSummary {
  currentPeriod: string | null;
  pausedOn: string | null;
  memberships: CircleMember[];
  startProposal: StartProposal | null;
}

export type PauseAction = 'pause' | 'resume';

export interface PauseResult {
  state: CycleState;
  /** `false` si ya estaba así. */
  changed: boolean;
}

/** Qué acción de pausa admite la junta en su estado: solo una en curso se pausa. */
export function pauseActionFor(state: CycleState): PauseAction | null {
  if (state === 'contributing') return 'pause';
  if (state === 'paused') return 'resume';
  return null;
}

/** Turnos ocupados frente a los turnos de la junta. */
export function fillRatio(circle: Pick<CircleSummary, 'members' | 'months'>): number {
  return circle.months === 0 ? 0 : Math.min(circle.members / circle.months, 1);
}
