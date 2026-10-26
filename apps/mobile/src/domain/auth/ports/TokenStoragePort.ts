import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

export interface SaveTokensOptions {
  /**
   * true (por defecto): la sesión sobrevive al cierre de la app ("Remember Me").
   * false: los tokens viven solo en memoria y la sesión termina al cerrar la app.
   */
  persist?: boolean;
}

export interface TokenStoragePort {
  read(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens, options?: SaveTokensOptions): Promise<void>;
  clear(): Promise<void>;
}
