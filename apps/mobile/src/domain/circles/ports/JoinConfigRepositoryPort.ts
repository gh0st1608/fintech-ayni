import type { JoinConfig } from '../JoinConfig';

export interface JoinConfigRepositoryPort {
  get(signal?: AbortSignal): Promise<JoinConfig>;
}
