import type { JoinCircleRequest, JoinedCircle } from '../JoinedCircle';
import type { MyCirclesPage, MyCircleStatus } from '../MyCircle';

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
}
