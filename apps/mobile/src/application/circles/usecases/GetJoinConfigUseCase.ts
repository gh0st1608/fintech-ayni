import type { JoinConfig } from '@/domain/circles/JoinConfig';
import type { JoinConfigRepositoryPort } from '@/domain/circles/ports/JoinConfigRepositoryPort';

/** Montos permitidos para unirse a un Game'ya o al programa de ahorro. */
export class GetJoinConfigUseCase {
  constructor(private readonly repository: JoinConfigRepositoryPort) {}

  /** En `currency` o, sin ella, en la moneda oficial (pending-scope M2). */
  execute(signal?: AbortSignal, currency?: string): Promise<JoinConfig> {
    return this.repository.get(signal, currency);
  }
}
