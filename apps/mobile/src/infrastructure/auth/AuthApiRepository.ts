import { z } from 'zod';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import {
  OtpVerificationError,
  type OtpRejectionReason,
} from '@/domain/auth/errors/OtpVerificationError';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

/** DTO del desafío OTP en /auth/start y /auth/resend (docs/api/auth.md). */
const challengeDto = z.object({
  challengeId: z.string().min(1),
  channel: z.enum(['email', 'sms']),
  maskedDestination: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
  resendAvailableAt: z.iso.datetime({ offset: true }),
});

const tokensDto = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

/** Códigos de error del backend para un OTP rechazado. */
const OTP_REJECTIONS: Record<string, OtpRejectionReason> = {
  OTP_INVALID: 'invalid',
  OTP_EXPIRED: 'expired',
  OTP_ATTEMPTS_EXCEEDED: 'attempts_exceeded',
};

function toChallenge(dto: z.infer<typeof challengeDto>): AuthChallenge {
  return {
    challengeId: dto.challengeId,
    channel: dto.channel,
    maskedDestination: dto.maskedDestination,
    expiresAt: new Date(dto.expiresAt),
    resendAvailableAt: new Date(dto.resendAvailableAt),
  };
}

function toOtpRejection(error: unknown): unknown {
  const reason = error instanceof AppError && error.code ? OTP_REJECTIONS[error.code] : undefined;
  if (!reason || !(error instanceof AppError)) return error;
  const remaining = Number(error.fieldErrors?.attemptsRemaining);
  return new OtpVerificationError(reason, Number.isInteger(remaining) ? remaining : undefined);
}

/** Adaptador HTTP de la API de autenticación del backend NestJS. */
export class AuthApiRepository implements AuthApiPort {
  constructor(private readonly http: HttpClientPort) {}

  async startAuthentication(
    identifier: LoginIdentifier,
    signal?: AbortSignal,
  ): Promise<AuthChallenge> {
    const dto = await this.http.post('/auth/start', {
      body: { identifier: identifier.value, type: identifier.kind },
      signal,
      parse: (data) => challengeDto.parse(data),
    });
    return toChallenge(dto);
  }

  async verifyOtp(challengeId: string, code: OtpCode, signal?: AbortSignal): Promise<AuthTokens> {
    try {
      const dto = await this.http.post('/auth/verify', {
        body: { challengeId, code: code.value },
        signal,
        parse: (data) => tokensDto.parse(data),
      });
      return AuthTokens.create(dto);
    } catch (error) {
      throw toOtpRejection(error);
    }
  }

  async resendOtp(challengeId: string, signal?: AbortSignal): Promise<AuthChallenge> {
    const dto = await this.http.post('/auth/resend', {
      body: { challengeId },
      signal,
      parse: (data) => challengeDto.parse(data),
    });
    return toChallenge(dto);
  }
}
