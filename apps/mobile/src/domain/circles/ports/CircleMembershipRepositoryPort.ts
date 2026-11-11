import type { JoinCircleRequest, JoinedCircle } from '../JoinedCircle';
import type { MyCirclesPage, MyCircleStatus } from '../MyCircle';
import type { MyCircleDetail } from '../MyCircleDetail';
import type { StartDecision, StartProposal } from '../StartProposal';

/** Membresías del usuario: unirse (POST /v1/circles/join) y mis círculos (GET /v1/me/circles). */
export interface CircleMembershipRepositoryPort {
  /**
   * Reserva el slot. Con la misma `idempotencyKey`, un reintento devuelve la misma unión.
   * Los rechazos llegan como AppError con el código del backend.
   */
  join(request: JoinCircleRequest, idempotencyKey: string): Promise<JoinedCircle>;
  /** Una página de mis círculos, de la unión más reciente a la más antigua. */
  listMine(
    status: MyCircleStatus,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<MyCirclesPage>;
  /**
   * Detalle de un círculo del usuario (COPAYNI-88). Si no es miembro vigente falla con
   * `CIRCLE_NOT_FOUND`.
   */
  getMine(circleId: string, signal?: AbortSignal): Promise<MyCircleDetail>;
  /** Círculos incompletos que esperan la respuesta del usuario (COPAYNI-62). */
  listStartProposals(signal?: AbortSignal): Promise<StartProposal[]>;
  /** Responde a la ronda que vio el usuario; si cambió, falla con `START_PROPOSAL_CHANGED`. */
  respondStartProposal(circleId: string, decision: StartDecision, round: number): Promise<void>;
}
