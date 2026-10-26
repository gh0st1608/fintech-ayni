import type { SupportedLanguage } from '@/domain/i18n/Language';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';

/**
 * Idioma inicial: preferencia guardada → primer idioma del dispositivo soportado
 * → idioma por defecto configurado → primer idioma soportado.
 */
export class ResolveLanguageUseCase {
  private readonly supportedCodes: readonly string[];

  constructor(
    private readonly preference: LanguagePreferencePort,
    private readonly deviceLocale: DeviceLocalePort,
    supported: readonly SupportedLanguage[],
    private readonly defaultCode: string,
  ) {
    if (supported.length === 0) throw new Error('At least one supported language is required');
    this.supportedCodes = supported.map(({ code }) => code);
  }

  async execute(): Promise<string> {
    const preferred = await this.preference.read().catch(() => null);
    const candidates = [preferred, ...this.deviceLocale.preferredLanguageCodes(), this.defaultCode];
    const resolved = candidates.find((code) => code != null && this.supportedCodes.includes(code));
    return resolved ?? this.supportedCodes[0]!;
  }
}
