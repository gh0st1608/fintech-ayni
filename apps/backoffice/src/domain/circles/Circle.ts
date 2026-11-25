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

/** Frecuencia de los turnos de una junta (COPAYNI-118). */
export const CADENCES = ['monthly', 'biweekly', 'weekly'] as const;
export type Cadence = (typeof CADENCES)[number];

/** Monto en unidades menores (céntimos) y su moneda ISO 4217. */
export interface Money {
  amount: number;
  currency: string;
}

export interface CircleSummary {
  circleId: string;
  state: CycleState;
  payout: Money;
  /** Turnos de la junta, que son sus puestos y sus cuotas. */
  turns: number;
  /**
   * Frecuencia de los turnos. Operar sin verla mezcla ciclos de distinta frecuencia en la misma
   * pantalla, y los totales dejan de cuadrar a simple vista (COPAYNI-118).
   */
  cadence: Cadence;
  /** `YYYY-MM`. */
  startsOn: string;
  /** `YYYY-MM-DD`: el día real del primer turno, que fuera de la mensual no es el 1. */
  startsOnDate: string;
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
  /** Turnos propuestos. El backend lo sigue enviando como `months`. */
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
export function fillRatio(circle: Pick<CircleSummary, 'members' | 'turns'>): number {
  return circle.turns === 0 ? 0 : Math.min(circle.members / circle.turns, 1);
}

/** Cómo se nombra la cadencia y su turno en las pantallas de operación. */
export const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
};

export const TURN_UNIT_LABELS: Record<Cadence, string> = {
  monthly: 'Mes',
  biweekly: 'Quincena',
  weekly: 'Semana',
};
