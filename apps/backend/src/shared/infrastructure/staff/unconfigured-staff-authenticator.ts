import { Injectable } from '@nestjs/common';

import {
  type StaffAuthenticatorPort,
  type StaffPrincipal,
} from '../../application/ports/staff-authenticator.port';
import { UnauthorizedError } from '../../errors/app-error';

/**
 * Sin identidad del personal todavía (fase 1 de docs/backoffice-plan.md): la API de
 * administración rechaza toda petición con 401.
 */
@Injectable()
export class UnconfiguredStaffAuthenticator implements StaffAuthenticatorPort {
  authenticate(): Promise<StaffPrincipal> {
    return Promise.reject(
      new UnauthorizedError('La autenticación del personal todavía no está configurada'),
    );
  }
}
