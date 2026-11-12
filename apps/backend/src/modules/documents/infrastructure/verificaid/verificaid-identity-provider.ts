import { Logger } from '@nestjs/common';

import { InfrastructureError } from '../../../../shared/errors/app-error';
import {
  type BiometricSession,
  type IdentityProviderPort,
} from '../../application/identity-verification.ports';
import {
  type BiometricStatus,
  type DocumentCheck,
  namesMatch,
} from '../../domain/identity-verification';

export interface VerificaIdSettings {
  /** `https://api.verifica.id` (producción) o `https://sandbox-api.verifica.id`. */
  apiUrl: string;
  /** Token Bearer de prod-hub.verifica.id. Es un secreto: nunca se registra. */
  apiToken: string;
  timeoutMs: number;
}

type Fetch = typeof fetch;

interface PersonBody {
  data?: {
    dni?: string;
    nombres?: string | null;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
  } | null;
}

interface SessionBody {
  data?: { id?: string; url?: string; status?: string } | null;
}

interface LastSessionBody {
  data?: { session_id?: string; status?: string } | null;
}

/** Estados de sesión de KYC Bravo (documentados en "Crear Sesión KYC Bravo"). */
const SESSION_STATUSES: Record<string, BiometricStatus> = {
  not_started: 'open',
  in_progress: 'open',
  in_review: 'in_review',
  approved: 'approved',
  declined: 'declined',
  expired: 'expired',
  kyc_expired: 'document_expired',
  abandoned: 'abandoned',
  error: 'error',
};

/**
 * IdentityProviderPort sobre la API de VerificaID (https://developers.verifica.id):
 * - Consulta: `POST /v2/consulta/personas` (form-data `dni`) devuelve nombres y apellidos de
 *   RENIEC; se comparan con el perfil.
 * - CheckMatch: `POST /api/v1/solutions/kyc-bravo/session` abre la sesión de KYC Bravo
 *   (verificación del documento, prueba de vida y comparación facial) y devuelve el enlace del
 *   flujo para la persona.
 * - Resultado: `POST /api/v1/solutions/kyc-bravo/sessions/last` con el DNI devuelve el estado de
 *   la última sesión. El webhook de VerificaID no tiene firma documentada: nunca se confía en su
 *   contenido, siempre se consulta aquí.
 *
 * Nunca registra el token, el DNI ni los nombres.
 */
export class VerificaIdIdentityProvider implements IdentityProviderPort {
  private readonly logger = new Logger('VerificaID');

  constructor(
    private readonly settings: VerificaIdSettings,
    private readonly http: Fetch = fetch,
  ) {}

  async checkDocument(props: {
    documentNumber: string;
    firstName: string;
    lastName: string;
  }): Promise<DocumentCheck> {
    const form = new FormData();
    form.append('dni', props.documentNumber);
    const response = await this.send('POST', '/v2/consulta/personas', form);
    // 404 o 422: el DNI no existe en RENIEC. El formato ya se validó antes de llamar. [verificar
    // con VerificaID qué código devuelve un DNI inexistente]
    if (response.status === 404 || response.status === 422) return 'not_found';
    const body = await this.json<PersonBody>(response, '/v2/consulta/personas');
    const person = body.data;
    if (!person?.nombres || !person.apellido_paterno) return 'not_found';
    return namesMatch(
      { firstName: props.firstName, lastName: props.lastName },
      {
        names: person.nombres,
        fathersLastName: person.apellido_paterno,
        mothersLastName: person.apellido_materno ?? '',
      },
    )
      ? 'matched'
      : 'mismatch';
  }

  async startBiometricSession(props: {
    reference: string;
    email: string;
    callbackUrl: string;
  }): Promise<BiometricSession> {
    const path = '/api/v1/solutions/kyc-bravo/session';
    // La API recibe los parámetros en la query string, no en el cuerpo.
    const query = new URLSearchParams({
      email: props.email,
      vendor_id: props.reference,
      callback_url: props.callbackUrl,
    });
    const response = await this.send('POST', `${path}?${query.toString()}`);
    const body = await this.json<SessionBody>(response, path);
    const session = body.data;
    if (!session?.id || !session.url) {
      throw new InfrastructureError('VerificaID no devolvió la sesión biométrica');
    }
    return { sessionId: session.id, url: session.url, status: this.statusOf(session.status) };
  }

  async biometricStatus(props: {
    sessionId: string;
    documentNumber: string;
  }): Promise<BiometricStatus | null> {
    const path = '/api/v1/solutions/kyc-bravo/sessions/last';
    const response = await this.send(
      'POST',
      path,
      JSON.stringify({ document_type: 'dni', document_number: props.documentNumber }),
    );
    const body = await this.json<LastSessionBody>(response, path);
    const last = body.data;
    // Sin sesión asociada al DNI todavía, o la última es otra: no hay resultado para esta.
    if (!last?.session_id || last.session_id !== props.sessionId) return null;
    return this.statusOf(last.status);
  }

  /** Un estado desconocido no decide nada: la sesión sigue abierta hasta tener uno conocido. */
  private statusOf(status: string | undefined): BiometricStatus {
    const known = status === undefined ? undefined : SESSION_STATUSES[status];
    if (known === undefined) {
      this.logger.warn({ event: 'identity.provider.unknown_status', status: status ?? null });
      return 'open';
    }
    return known;
  }

  private async send(method: 'POST', path: string, body?: FormData | string): Promise<Response> {
    try {
      return await this.http(`${this.settings.apiUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.settings.apiToken}`,
          // Con FormData, fetch fija el Content-Type con el boundary.
          ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      // Solo el nombre del error (p. ej. TimeoutError): el mensaje puede traer la URL.
      throw new InfrastructureError(
        `VerificaID no respondió: ${(error as { name?: string } | null)?.name ?? 'error'}`,
      );
    }
  }

  private async json<T>(response: Response, path: string): Promise<T> {
    if (!response.ok) {
      // Solo la ruta y el estado: el cuerpo puede traer datos personales. 429 es cuota agotada.
      this.logger.warn({ event: 'identity.provider.error', path, status: response.status });
      throw new InfrastructureError(`VerificaID respondió ${response.status} en ${path}`);
    }
    return (await response.json()) as T;
  }
}
