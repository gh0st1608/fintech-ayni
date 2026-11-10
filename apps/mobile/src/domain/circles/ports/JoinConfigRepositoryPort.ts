import type { JoinConfig } from '../JoinConfig';

export interface JoinConfigRepositoryPort {
  /** La configuración en `currency`, o en la moneda oficial si no se indica. */
  get(signal?: AbortSignal, currency?: string): Promise<JoinConfig>;
}
