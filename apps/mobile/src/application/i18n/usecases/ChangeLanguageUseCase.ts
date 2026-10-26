import { UnsupportedLanguageError, type SupportedLanguage } from '@/domain/i18n/Language';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';

export interface ChangeLanguageResult {
  /** true cuando cambia LTR↔RTL: el layout se actualiza al reiniciar la app. */
  requiresRestart: boolean;
}

export class ChangeLanguageUseCase {
  constructor(
    private readonly preference: LanguagePreferencePort,
    private readonly layoutDirection: LayoutDirectionPort,
    private readonly supported: readonly SupportedLanguage[],
  ) {}

  async execute(languageCode: string): Promise<ChangeLanguageResult> {
    const language = this.supported.find(({ code }) => code === languageCode);
    if (!language) throw new UnsupportedLanguageError(`Unsupported language: ${languageCode}`);

    await this.preference.save(language.code);

    const requiresRestart = this.layoutDirection.current() !== language.direction;
    if (requiresRestart) this.layoutDirection.apply(language.direction);
    return { requiresRestart };
  }
}
