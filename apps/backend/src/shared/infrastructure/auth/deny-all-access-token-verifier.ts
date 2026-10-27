import { Injectable } from '@nestjs/common';

import {
  type AccessTokenVerifierPort,
  type Principal,
} from '../../application/ports/access-token-verifier.port';
import { UnauthorizedError } from '../../errors/app-error';

/**
 * Rechaza todos los tokens. Es el verificador por defecto hasta que el módulo auth
 * implemente la verificación de JWT (COPAYNI-19, 20): ninguna ruta protegida queda abierta.
 */
@Injectable()
export class DenyAllAccessTokenVerifier implements AccessTokenVerifierPort {
  verify(): Promise<Principal> {
    return Promise.reject(new UnauthorizedError());
  }
}
