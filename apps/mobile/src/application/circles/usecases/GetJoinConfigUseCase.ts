import type { JoinConfig } from '@/domain/circles/JoinConfig';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';

/** Montos permitidos para unirse a un Game'ya o al programa de ahorro. */
export class GetJoinConfigUseCase {
  constructor(private readonly repository: JoinConfigRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<JoinConfig> {
    return this.repository.get(signal);
  }
}
