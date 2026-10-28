import type { LanguageSyncStatePort } from '@/domain/i18n/ports/LanguageSyncStatePort';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';

export type LanguageSyncResult = 'synced' | 'pending' | 'nothing_pending';

/**
 * Sincroniza el idioma con el perfil del backend, de mejor esfuerzo: el idioma de la app
 * nunca depende del backend. Si falla, queda pendiente y se reintenta en el siguiente arranque.
 */
export class SyncLanguagePreferenceUseCase {
  constructor(
    private readonly profile: UserProfileRepositoryPort,
    private readonly state: LanguageSyncStatePort,
  ) {}

  /** Nunca lanza: un fallo deja el idioma pendiente. */
  async execute(languageCode: string): Promise<LanguageSyncResult> {
    try {
      await this.state.markPending(languageCode);
      await this.profile.updatePreferredLanguage(languageCode);
      // Si mientras tanto se eligió otro idioma, ese sigue pendiente.
      if ((await this.state.pending()) === languageCode) await this.state.clear();
      return 'synced';
    } catch {
      return 'pending';
    }
  }

  async retryPending(): Promise<LanguageSyncResult> {
    let languageCode: string | null;
    try {
      languageCode = await this.state.pending();
    } catch {
      return 'pending';
    }
    return languageCode ? this.execute(languageCode) : 'nothing_pending';
  }
}
