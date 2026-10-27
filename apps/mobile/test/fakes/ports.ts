import type { SaveTokensOptions, TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { TextDirection } from '@/domain/i18n/Language';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';
import type { LanguagePreferencePort } from '@/domain/i18n/ports/LanguagePreferencePort';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';

export class InMemoryTokenStorage implements TokenStoragePort {
  tokens: AuthTokens | null = null;
  /** Si la última sesión guardada debía sobrevivir al cierre de la app. */
  persisted: boolean | null = null;
  failOnRead = false;

  async read() {
    if (this.failOnRead) throw new Error('storage unavailable');
    return this.tokens;
  }

  async save(tokens: AuthTokens, { persist }: SaveTokensOptions = {}) {
    this.tokens = tokens;
    this.persisted = persist ?? this.persisted ?? true;
  }

  async clear() {
    this.tokens = null;
    this.persisted = null;
  }
}

export class InMemoryLanguagePreference implements LanguagePreferencePort {
  constructor(public stored: string | null = null) {}

  async read() {
    return this.stored;
  }

  async save(languageCode: string) {
    this.stored = languageCode;
  }
}

export class FakeDeviceLocale implements DeviceLocalePort {
  constructor(public codes: string[] = ['es']) {}

  preferredLanguageCodes() {
    return this.codes;
  }
}

export class FakeLayoutDirection implements LayoutDirectionPort {
  applied: TextDirection[] = [];

  constructor(private direction: TextDirection = 'ltr') {}

  current() {
    return this.direction;
  }

  apply(direction: TextDirection) {
    this.direction = direction;
    this.applied.push(direction);
  }
}
