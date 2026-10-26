import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidAuthTokensError extends DomainError {
  readonly code = 'INVALID_AUTH_TOKENS';
}

/** Par de credenciales de sesión. Nunca debe registrarse en logs ni persistirse fuera de un almacén seguro. */
export class AuthTokens {
  private constructor(
    readonly accessToken: string,
    readonly refreshToken: string,
  ) {}

  static create(input: { accessToken: string; refreshToken: string }): AuthTokens {
    const accessToken = input.accessToken.trim();
    const refreshToken = input.refreshToken.trim();
    if (!accessToken || !refreshToken) {
      throw new InvalidAuthTokensError('Access and refresh tokens are required');
    }
    return new AuthTokens(accessToken, refreshToken);
  }
}
