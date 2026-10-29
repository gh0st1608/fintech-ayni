import type { MyCirclesPage, MyCircleStatus } from '@/domain/circles/MyCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';

/** Mis círculos activos o finalizados, por páginas (COPAYNI-26). */
export class ListMyCirclesUseCase {
  constructor(private readonly repository: CircleMembershipRepositoryPort) {}

  execute(
    status: MyCircleStatus,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<MyCirclesPage> {
    return this.repository.listMine(status, cursor, signal);
  }
}
