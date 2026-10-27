export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/** Usuario autenticado de la petición. */
export interface Principal {
  readonly userId: string;
}

/**
 * Valida un access token y devuelve su usuario. Lanza `UnauthorizedError` si el token
 * no es válido. La implementación con JWT llega con el módulo auth (COPAYNI-19, 20).
 */
export interface AccessTokenVerifierPort {
  verify(accessToken: string): Promise<Principal>;
}
