import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { InfrastructureError } from '../../../../shared/errors/app-error';
import {
  type OtpGeneratorPort,
  type OtpHasherPort,
  type OtpSenderPort,
  type RefreshTokenSecretsPort,
} from '../../application/ports/auth.ports';

/** Código aleatorio criptográficamente seguro de 4 dígitos. */
@Injectable()
export class RandomOtpGenerator implements OtpGeneratorPort {
  generate(): string {
    return randomInt(0, 10_000).toString().padStart(4, '0');
  }
}

/** Solo desarrollo (`OTP_DEV_CODE`): todos los desafíos usan el mismo código. */
export class FixedOtpGenerator implements OtpGeneratorPort {
  constructor(private readonly code: string) {}

  generate(): string {
    return this.code;
  }
}

/**
 * HMAC-SHA256 con un secreto del servidor (`OTP_PEPPER`) sobre el desafío y el código: con la
 * base filtrada, sin el secreto no se pueden probar las 10.000 combinaciones.
 */
export class HmacOtpHasher implements OtpHasherPort {
  constructor(private readonly pepper: string) {}

  hash(challengeId: string, code: string): string {
    return createHmac('sha256', this.pepper).update(`${challengeId}:${code}`).digest('hex');
  }

  matches(challengeId: string, code: string, codeHash: string): boolean {
    const expected = Buffer.from(codeHash, 'hex');
    const actual = Buffer.from(this.hash(challengeId, code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

/** Solo desarrollo: no envía nada; el código es `OTP_DEV_CODE`. Nunca registra el código. */
export class DevOtpSender implements OtpSenderPort {
  private readonly logger = new Logger('Auth');

  send({ channel }: Parameters<OtpSenderPort['send']>[0]): Promise<void> {
    this.logger.warn({ event: 'auth.otp_not_sent', channel, reason: 'OTP_DEV_CODE' });
    return Promise.resolve();
  }
}

/**
 * Sin proveedor de SMS ni email (pending-scope T6): el envío falla con 503 en lugar de dar por
 * enviado un código que nunca llega.
 */
export class UnavailableOtpSender implements OtpSenderPort {
  send(): Promise<void> {
    return Promise.reject(new InfrastructureError('No hay proveedor de envío de OTP configurado'));
  }
}

/** Refresh token: 32 bytes aleatorios en base64url. En la base, su SHA-256. */
@Injectable()
export class CryptoRefreshTokenSecrets implements RefreshTokenSecretsPort {
  generate(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
