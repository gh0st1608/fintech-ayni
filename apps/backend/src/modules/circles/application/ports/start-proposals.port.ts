import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type StartDecision } from '../../domain/services/start-approval';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';

export const CIRCLE_START_PROPOSALS = Symbol('CIRCLE_START_PROPOSALS');

/** Propuesta de reducir un círculo, vista por uno de sus miembros (COPAYNI-62). */
export interface MemberStartProposal {
  circleId: string;
  /** Ronda vigente: cambia cada vez que alguien sale y se proponen condiciones nuevas. */
  round: number;
  current: CircleTerms;
  proposed: CircleTerms;
  /** Su turno en el círculo reducido. */
  position: number;
  respondBy: LocalDate;
  decision: StartDecision | null;
}

export interface CircleStartProposalsPort {
  listFor(userId: string): Promise<MemberStartProposal[]>;
  /**
   * Guarda la respuesta con el círculo bloqueado, para no cruzarse con la tarea diaria. Una
   * propuesta que se resolvió mientras tanto se rechaza con `START_PROPOSAL_NOT_FOUND`; una que
   * pasó a otra ronda, con `START_PROPOSAL_CHANGED`.
   */
  respond(circleId: string, userId: string, decision: StartDecision, round: number): Promise<void>;
}
