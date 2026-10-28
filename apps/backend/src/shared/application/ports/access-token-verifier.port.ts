export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/** Usuario autenticado de la petición. */
export interface Principal {
  readonly userId: string;
}

/**
 * Valida un access token y devuelve su usuario. Lanza `UnauthorizedError` si el token
 * no es válido. Implementación: `Es256JwtVerifier` del módulo auth.
 */
export interface AccessTokenVerifierPort {
  verify(accessToken: string): Promise<Principal>;
}
