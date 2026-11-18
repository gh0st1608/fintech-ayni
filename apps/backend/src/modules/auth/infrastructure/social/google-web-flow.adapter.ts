import { Logger } from '@nestjs/common';

import { InfrastructureError } from '../../../../shared/errors/app-error';
import { type GoogleWebFlowPort } from '../../application/ports/social-auth.ports';

export interface GoogleWebFlowSettings {
  /** `https://oauth2.googleapis.com/token`. */
  tokenUrl: string;
  /** Client ID del cliente **Web** de Google Cloud Console. */
  clientId: string;
  /** Client secret de ese cliente. Es un secreto: solo vive en el backend. */
  clientSecret: string;
  /** El mismo `redirect_uri` del paso de autorización; Google exige que coincida. */
  redirectUri: string;
  timeoutMs: number;
}

type Fetch = typeof fetch;

/**
 * Canje del `authorization code` de Google (COPAYNI-91 §9).
 *
 * El `id_token` que devuelve **no** se da por bueno aquí: lo verifica después el adaptador de
 * Google contra el JWKS, como cualquier otro. Este canje solo lo trae.
 */
export class GoogleWebFlowAdapter implements GoogleWebFlowPort {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly settings: GoogleWebFlowSettings,
    private readonly http: Fetch = (...args) => fetch(...args),
  ) {}

  isConfigured(): boolean {
    return (
      this.settings.clientId.length > 0 &&
      this.settings.clientSecret.length > 0 &&
      this.settings.redirectUri.length > 0
    );
  }

  async exchange(input: { code: string; codeVerifier: string }): Promise<string> {
    if (!this.isConfigured()) {
      throw new InfrastructureError('El inicio de sesión con google no está disponible');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
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
      throw new InfrastructureError('Google no respondió al canjear el código', error);
    }

    if (!response.ok) {
      // Solo el estado: el cuerpo trae el código y el secreto, que no se registran.
      this.logger.warn({ event: 'auth.google_exchange_failed', status: response.status });
      throw new InfrastructureError('Google rechazó el canje del código');
    }
    const payload = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
    if (typeof payload?.id_token !== 'string') {
      throw new InfrastructureError('Google no devolvió el id_token');
    }
    return payload.id_token;
  }
}
