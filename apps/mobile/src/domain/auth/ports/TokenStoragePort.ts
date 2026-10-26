import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

export interface TokenStoragePort {
  read(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}
