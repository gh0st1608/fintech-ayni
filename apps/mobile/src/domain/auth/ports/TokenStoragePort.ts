import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

export interface SaveTokensOptions {
  /**
   * true: la sesión sobrevive al cierre de la app ("Remember Me").
   * false: los tokens viven solo en memoria y la sesión termina al cerrar la app.
   * Sin indicar: se conserva el modo de la sesión actual (persistente si no hay ninguna),
   * así una renovación no cambia la elección del usuario.
   */
  persist?: boolean;
}

export interface TokenStoragePort {
  read(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens, options?: SaveTokensOptions): Promise<void>;
  clear(): Promise<void>;
}
