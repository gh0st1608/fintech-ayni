import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

/** Adaptador HTTP del perfil (PATCH /v1/me, COPAYNI-50). La respuesta no se usa. */
export class UserProfileApiRepository implements UserProfileRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async updatePreferredLanguage(languageCode: string): Promise<void> {
    await this.http.patch('/me', { body: { preferredLanguage: languageCode } });
  }
}
