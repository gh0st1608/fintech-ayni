import { createHash, randomBytes } from 'node:crypto';

import { UnauthorizedError } from '../../../../shared/errors/app-error';

/** Valor aleatorio de 32 bytes en base64url: 43 caracteres, los que guarda la base. */
export const secret = (): string => randomBytes(32).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Reto de PKCE (RFC 7636) en S256: el hash del `code_verifier`, no el verifier. Lo que viaja al
 * navegador es este reto; el verifier se queda en el servidor hasta el canje.
 */
export const pkceChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

/** El intento no existe, ya se usó o venció. Siempre se responde lo mismo. */
export const invalidFlow = (): UnauthorizedError =>
  new UnauthorizedError('El inicio de sesión no se pudo completar. Vuelve a intentarlo.');
