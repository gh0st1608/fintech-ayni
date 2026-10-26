import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

/** Persiste las credenciales emitidas por el backend y abre la sesión. */
export class SignInUseCase {
  constructor(private readonly tokens: TokenStoragePort) {}

  async execute(input: { accessToken: string; refreshToken: string }): Promise<SessionStatus> {
    await this.tokens.save(AuthTokens.create(input));
    return 'authenticated';
  }
}
