import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';

import type {
  IdentityRejectionReason,
  IdentityVerification,
  IdentityVerificationStatus,
} from '@/domain/documents/IdentityVerification';
import type {
  IdentityVerificationRepositoryPort,
  WebAuthSessionPort,
} from '@/domain/documents/ports/IdentityVerificationPorts';
import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

const STATUS_BY_DTO = {
  not_started: 'notStarted',
  in_progress: 'inProgress',
  in_review: 'inReview',
  approved: 'approved',
  rejected: 'rejected',
} as const satisfies Record<string, IdentityVerificationStatus>;

const REASON_BY_DTO: Record<string, IdentityRejectionReason> = {
  document_not_found: 'documentNotFound',
  data_mismatch: 'dataMismatch',
  document_in_use: 'documentInUse',
  biometric_declined: 'biometricDeclined',
  document_expired: 'documentExpired',
  session_expired: 'sessionExpired',
  abandoned: 'abandoned',
  provider_error: 'providerError',
};

const verificationDto = z.object({
  status: z.enum(Object.keys(STATUS_BY_DTO) as [keyof typeof STATUS_BY_DTO]),
  consentVersion: z.string().min(1),
  documentNumber: z.string().nullable(),
  reason: z.string().nullable(),
  // Solo enlaces https: la app no abre una URL arbitraria del servidor.
  verificationUrl: z.url({ protocol: /^https$/ }).nullable(),
  decidedAt: z.iso.datetime({ offset: true }).nullable(),
});

const toVerification = (dto: z.infer<typeof verificationDto>): IdentityVerification => ({
  status: STATUS_BY_DTO[dto.status],
  consentVersion: dto.consentVersion,
  documentNumber: dto.documentNumber,
  reason: dto.reason ? (REASON_BY_DTO[dto.reason] ?? 'providerError') : null,
  verificationUrl: dto.verificationUrl,
  decidedAt: dto.decidedAt ? new Date(dto.decidedAt) : null,
});

/** Adaptador HTTP de la verificación de identidad (COPAYNI-42 y 92). */
export class IdentityVerificationApiRepository implements IdentityVerificationRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async get(signal?: AbortSignal): Promise<IdentityVerification> {
    return toVerification(
      await this.http.get('/me/identity-verification', {
        signal,
        parse: (data) => verificationDto.parse(data),
      }),
    );
  }

  async start(input: {
    documentNumber: string;
    consentVersion: string;
  }): Promise<IdentityVerification> {
    return toVerification(
      await this.http.post('/me/identity-verification', {
        body: input,
        parse: (data) => verificationDto.parse(data),
      }),
    );
  }
}

/** El navegador del sistema (expo-web-browser): ASWebAuthenticationSession o Custom Tab. */
export class ExpoWebAuthSession implements WebAuthSessionPort {
  async open(url: string, returnUrl: string): Promise<'returned' | 'closed'> {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    return result.type === 'success' ? 'returned' : 'closed';
  }
}

/**
 * Verificación falsa para dev y pruebas, con las mismas reglas que el proveedor simulado del
 * backend: `00000000` no existe, `11111111` no coincide y el resto se aprueba al volver.
 */
export class InMemoryIdentityVerificationRepository implements IdentityVerificationRepositoryPort {
  current: IdentityVerification = {
    status: 'notStarted',
    consentVersion: '2026-11',
    documentNumber: null,
    reason: null,
    verificationUrl: null,
    decidedAt: null,
  };
  attempts = 0;
  maxAttempts = 3;

  constructor(private readonly latencyMs = 300) {}

  async get(signal?: AbortSignal): Promise<IdentityVerification> {
    await simulateLatency(this.latencyMs, signal);
    if (this.current.status === 'inProgress') {
      this.current = {
        ...this.current,
        status: 'approved',
        verificationUrl: null,
        decidedAt: new Date(),
      };
    }
    return { ...this.current };
  }

  async start(input: {
    documentNumber: string;
    consentVersion: string;
  }): Promise<IdentityVerification> {
    await simulateLatency(this.latencyMs);
    if (this.current.status === 'approved') {
      throw new AppError('conflict', 'Already verified', { code: 'IDENTITY_ALREADY_VERIFIED' });
    }
    if (this.attempts >= this.maxAttempts) {
      throw new AppError('conflict', 'Too many attempts', { code: 'IDENTITY_ATTEMPTS_EXCEEDED' });
    }
    const masked = `•••••${input.documentNumber.slice(-3)}`;
    const reason =
      input.documentNumber === '00000000'
        ? 'documentNotFound'
        : input.documentNumber === '11111111'
          ? 'dataMismatch'
          : null;
    if (reason) this.attempts += 1;
    this.current = {
      status: reason ? 'rejected' : 'inProgress',
      consentVersion: input.consentVersion,
      documentNumber: masked,
      reason,
      verificationUrl: reason ? null : 'https://kyc.simulated.ayni/session/dev',
      decidedAt: reason ? new Date() : null,
    };
    return { ...this.current };
  }
}

/** Sin navegador: simula que la persona completó el flujo y volvió a la app. */
export class FakeWebAuthSession implements WebAuthSessionPort {
  readonly opened: string[] = [];
  result: 'returned' | 'closed' = 'returned';

  open(url: string): Promise<'returned' | 'closed'> {
    this.opened.push(url);
    return Promise.resolve(this.result);
  }
}
