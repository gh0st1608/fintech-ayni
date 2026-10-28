/** Idioma elegido que todavía no llegó al perfil del backend. Es una preferencia no sensible. */
export interface LanguageSyncStatePort {
  pending(): Promise<string | null>;
  markPending(languageCode: string): Promise<void>;
  clear(): Promise<void>;
}
