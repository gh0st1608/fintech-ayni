import { type ClockPort } from '../../application/ports/clock.port';
// El JWKS es compartido con el login social de la app (COPAYNI-91).
import { type JwksPort } from '../crypto/http-jwks';
import {
  type StaffAuthenticatorPort,
  type StaffPrincipal,
} from '../../application/ports/staff-authenticator.port';
import { UnauthorizedError } from '../../errors/app-error';
import { type StaffJwtExpectations, verifyStaffJwt } from './staff-jwt';

/**
 * Personal autenticado por un proveedor OIDC con MFA (recomendado: Amazon Cognito, BO2 de
 * docs/backoffice-plan.md). Valida firma, emisor, audiencia y vigencia; los roles salen de los
 * grupos del proveedor.
 */
export class OidcStaffAuthenticator implements StaffAuthenticatorPort {
  constructor(
    private readonly expected: StaffJwtExpectations,
    private readonly jwks: JwksPort,
    private readonly clock: ClockPort,
  ) {}

  authenticate(accessToken: string): Promise<StaffPrincipal> {
    return verifyStaffJwt(
      accessToken,
      async (kid) => {
        if (!kid) throw new UnauthorizedError('Token del personal inválido');
        return this.jwks.key(kid);
      },
      this.expected,
      this.clock.now(),
    );
  }
}
