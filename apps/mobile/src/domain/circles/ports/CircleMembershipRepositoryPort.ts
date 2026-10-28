import type { JoinCircleRequest, JoinedCircle } from '../JoinedCircle';

/** Unión a un Game'ya (POST /v1/circles/join, docs/api/circles.md). */
export interface CircleMembershipRepositoryPort {
  /**
   * Reserva el slot. Con la misma `idempotencyKey`, un reintento devuelve la misma unión.
   * Los rechazos llegan como AppError con el código del backend.
   */
  join(request: JoinCircleRequest, idempotencyKey: string): Promise<JoinedCircle>;
}
