import type { MyCircleDetail } from '@/domain/circles/MyCircleDetail';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';

/** Detalle de uno de mis círculos: pozo, progreso, mi turno y los turnos (COPAYNI-88). */
export class GetMyCircleUseCase {
  constructor(private readonly repository: CircleMembershipRepositoryPort) {}

  execute(circleId: string, signal?: AbortSignal): Promise<MyCircleDetail> {
    return this.repository.getMine(circleId, signal);
  }
}
