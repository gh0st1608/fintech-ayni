import { createPrivateKey, type KeyObject, sign } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { type ClockPort } from '../../../../shared/application/ports/clock.port';
import { InfrastructureError } from '../../../../shared/errors/app-error';
import { type AppleWebFlowPort } from '../../application/ports/social-auth.ports';

export interface AppleWebFlowSettings {
  /** `https://appleid.apple.com/auth/token`. */
  tokenUrl: string;
  teamId: string;
  keyId: string;
  /** Services ID del flujo web (el `client_id` del canje). */
  serviceId: string;
  redirectUri: string;
  /** Clave `.p8` de Sign in with Apple. Es un secreto: solo vive en el backend. */
  privateKey: KeyObject | null;
  timeoutMs: number;
}

type Fetch = typeof fetch;

/** El client secret de Apple es un JWT corto firmado con la clave `.p8`; dura como mucho 6 meses. */
const CLIENT_SECRET_TTL_SECONDS = 300;

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Canje del `authorization code` de Apple (COPAYNI-91 §9), solo para el flujo web de Android.
 *
 * El `client_secret` se firma aquí con la clave privada de Apple, que nunca sale del backend. El
 * `id_token` resultante lo verifica después el adaptador de Apple como cualquier otro: este canje
 * no da por buena la identidad, solo la trae.
 */
export class AppleWebFlowAdapter implements AppleWebFlowPort {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly settings: AppleWebFlowSettings,
    private readonly clock: ClockPort,
    private readonly http: Fetch = (...args) => fetch(...args),
  ) {}

  isConfigured(): boolean {
    return this.settings.privateKey !== null && this.settings.serviceId.length > 0;
  }

  async exchange(code: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new InfrastructureError('El inicio de sesión con apple no está disponible');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.settings.serviceId,
      client_secret: this.clientSecret(),
      redirect_uri: this.settings.redirectUri,
    });

    let response: Response;
    try {
      response = await this.http(this.settings.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      throw new InfrastructureError('Apple no respondió al canjear el código', error);
    }

    if (!response.ok) {
      // El cuerpo trae el motivo de Apple; no se registra el código ni el secreto.
      this.logger.warn({ event: 'auth.apple_exchange_failed', status: response.status });
      throw new InfrastructureError('Apple rechazó el canje del código');
    }
    const payload = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
    if (typeof payload?.id_token !== 'string') {
      throw new InfrastructureError('Apple no devolvió el id_token');
    }
    return payload.id_token;
  }

  /** JWT ES256 con `iss` = Team ID y `sub` = Services ID, como exige Apple. */
  private clientSecret(): string {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const header = base64url({ alg: 'ES256', kid: this.settings.keyId, typ: 'JWT' });
    const payload = base64url({
      iss: this.settings.teamId,
      iat: now,
      exp: now + CLIENT_SECRET_TTL_SECONDS,
      aud: 'https://appleid.apple.com',
      sub: this.settings.serviceId,
    });
    const input = `${header}.${payload}`;
    const signature = sign('sha256', Buffer.from(input), {
      key: this.settings.privateKey!,
      dsaEncoding: 'ieee-p1363',
    });
    return `${input}.${signature.toString('base64url')}`;
  }
}

/** La clave `.p8` tal cual la entrega Apple; sin ella, el flujo web de Android queda apagado. */
export const parseApplePrivateKey = (pem: string | undefined): KeyObject | null => {
  if (!pem?.trim()) return null;
  return createPrivateKey(pem.replace(/\\n/g, '\n'));
};
