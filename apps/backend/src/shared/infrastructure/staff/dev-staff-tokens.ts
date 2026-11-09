import { generateKeyPairSync, type KeyObject, randomUUID, sign } from 'node:crypto';

import { type ClockPort } from '../../application/ports/clock.port';
import {
  type StaffAuthenticatorPort,
  type StaffPrincipal,
  type StaffRole,
} from '../../application/ports/staff-authenticator.port';
import { verifyStaffJwt } from './staff-jwt';

export const DEV_STAFF_TOKENS = Symbol('DEV_STAFF_TOKENS');

const ISSUER = 'ayni-dev-staff';
const AUDIENCE = 'ayni-backoffice';
const ROLES_CLAIM = 'roles';
const TTL_SECONDS = 3600;

export interface DevStaffSession {
  accessToken: string;
  expiresIn: number;
}

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Identidad del personal solo para desarrollo (`STAFF_AUTH_PROVIDER=dev`, prohibido en
 * production): emite tokens con el rol pedido, firmados con una clave efímera que cambia en cada
 * arranque. Sirve para usar el back-office en local hasta conectar el proveedor real (BO2).
 */
export class DevStaffTokens implements StaffAuthenticatorPort {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId = randomUUID();

  constructor(private readonly clock: ClockPort) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  issue(email: string, roles: readonly StaffRole[]): DevStaffSession {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const input = `${encode({ alg: 'ES256', typ: 'JWT', kid: this.keyId })}.${encode({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: `dev:${email}`,
      email,
      [ROLES_CLAIM]: roles,
      iat: now,
      auth_time: now,
      exp: now + TTL_SECONDS,
    })}`;
    const signature = sign('sha256', Buffer.from(input), {
      key: this.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return { accessToken: `${input}.${signature.toString('base64url')}`, expiresIn: TTL_SECONDS };
  }

  authenticate(accessToken: string): Promise<StaffPrincipal> {
    return verifyStaffJwt(
      accessToken,
      (kid, alg) => Promise.resolve(kid === this.keyId && alg === 'ES256' ? this.publicKey : null),
      { issuer: ISSUER, audience: AUDIENCE, rolesClaim: ROLES_CLAIM },
      this.clock.now(),
    );
  }
}
