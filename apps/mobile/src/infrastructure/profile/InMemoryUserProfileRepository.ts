import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryUserProfileOptions {
  latencyMs?: number;
}

/** Perfil falso (contract-first) mientras no exista PATCH /v1/me en el backend. */
export class InMemoryUserProfileRepository implements UserProfileRepositoryPort {
  preferredLanguage: string | null = null;
  private readonly latencyMs: number;

  constructor(options: InMemoryUserProfileOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
  }

  async updatePreferredLanguage(languageCode: string): Promise<void> {
    await simulateLatency(this.latencyMs);
    this.preferredLanguage = languageCode;
  }
}
