/** Idioma elegido por el usuario. Es una preferencia no sensible. */
export interface LanguagePreferencePort {
  read(): Promise<string | null>;
  save(languageCode: string): Promise<void>;
}
