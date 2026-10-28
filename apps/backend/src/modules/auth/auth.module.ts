import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { type AppConfigService } from '../../config/configuration';
import { ACCESS_TOKEN_VERIFIER } from '../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../shared/application/ports/clock.port';
import { UsersModule } from '../users/users.module';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_CHALLENGE_REPOSITORY,
  AUTH_POLICY,
  type AuthPolicy,
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  REFRESH_TOKEN_REPOSITORY,
  REFRESH_TOKEN_SECRETS,
} from './application/ports/auth.ports';
import { SessionIssuer } from './application/services/session-issuer';
import {
  ResendOtpUseCase,
  StartAuthenticationUseCase,
  VerifyOtpUseCase,
} from './application/use-cases/otp.use-cases';
import { LogoutUseCase, RefreshSessionUseCase } from './application/use-cases/session.use-cases';
import {
  Es256JwtIssuer,
  Es256JwtVerifier,
  type JwtSettings,
  parsePrivateKey,
} from './infrastructure/crypto/es256-jwt';
import {
  CryptoRefreshTokenSecrets,
  DevOtpSender,
  FixedOtpGenerator,
  HmacOtpHasher,
  RandomOtpGenerator,
  UnavailableOtpSender,
} from './infrastructure/crypto/otp.adapters';
import {
  AuthChallengeEntity,
  RefreshTokenEntity,
} from './infrastructure/persistence/typeorm/auth.entities';
import { TypeOrmAuthChallengeRepository } from './infrastructure/persistence/typeorm/typeorm-auth-challenge.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/persistence/typeorm/typeorm-refresh-token.repository';
import { AuthController } from './presentation/http/controllers/auth.controller';

const JWT_SETTINGS = Symbol('JWT_SETTINGS');
const logger = new Logger('Auth');

/**
 * Fuera de production, una clave o un secreto ausente se genera al arrancar (la validación de
 * entorno los exige en production). Lo efímero deja de valer al reiniciar.
 */
function jwtSettings(config: AppConfigService): JwtSettings {
  const pem = config.get('JWT_PRIVATE_KEY', { infer: true });
  if (!pem) logger.warn('JWT_PRIVATE_KEY sin valor: se usa una clave efímera (solo desarrollo)');
  return {
    privateKey: pem
      ? parsePrivateKey(pem)
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey,
    keyId: config.get('JWT_KEY_ID', { infer: true }),
    issuer: config.get('JWT_ISSUER', { infer: true }),
    audience: config.get('JWT_AUDIENCE', { infer: true }),
    ttlSeconds: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
  };
}

function authPolicy(config: AppConfigService): AuthPolicy {
  return {
    otp: {
      codeTtlSeconds: config.get('OTP_CODE_TTL_SECONDS', { infer: true }),
      resendCooldownSeconds: config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true }),
      maxAttempts: config.get('OTP_MAX_ATTEMPTS', { infer: true }),
      maxResends: config.get('OTP_MAX_RESENDS', { infer: true }),
    },
    startMaxPerWindow: config.get('OTP_START_MAX_PER_WINDOW', { infer: true }),
    startWindowSeconds: config.get('OTP_START_WINDOW_SECONDS', { infer: true }),
    refreshTokenTtlDays: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
  };
}

/**
 * Autenticación sin contraseña con OTP, JWT ES256 y refresh tokens rotativos (COPAYNI-19, 20 y
 * 21). Exporta el verificador de access tokens que usa BearerAuthGuard.
 */
@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([AuthChallengeEntity, RefreshTokenEntity])],
  controllers: [AuthController],
  providers: [
    StartAuthenticationUseCase,
    VerifyOtpUseCase,
    ResendOtpUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    SessionIssuer,
    TypeOrmAuthChallengeRepository,
    TypeOrmRefreshTokenRepository,
    { provide: AUTH_CHALLENGE_REPOSITORY, useExisting: TypeOrmAuthChallengeRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: TypeOrmRefreshTokenRepository },
    { provide: REFRESH_TOKEN_SECRETS, useClass: CryptoRefreshTokenSecrets },
    { provide: AUTH_POLICY, inject: [ConfigService], useFactory: authPolicy },
    { provide: JWT_SETTINGS, inject: [ConfigService], useFactory: jwtSettings },
    {
      provide: ACCESS_TOKEN_ISSUER,
      inject: [JWT_SETTINGS, CLOCK],
      useFactory: (settings: JwtSettings, clock: ClockPort) => new Es256JwtIssuer(settings, clock),
    },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [JWT_SETTINGS, CLOCK],
      useFactory: (settings: JwtSettings, clock: ClockPort) =>
        new Es256JwtVerifier(settings, clock),
    },
    {
      provide: OTP_HASHER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const pepper = config.get('OTP_PEPPER', { infer: true });
        if (!pepper) logger.warn('OTP_PEPPER sin valor: se usa uno efímero (solo desarrollo)');
        return new HmacOtpHasher(pepper ?? randomBytes(32).toString('hex'));
      },
    },
    {
      provide: OTP_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const devCode = config.get('OTP_DEV_CODE', { infer: true });
        return devCode ? new FixedOtpGenerator(devCode) : new RandomOtpGenerator();
      },
    },
    {
      provide: OTP_SENDER,
      inject: [ConfigService],
      // Proveedor pendiente (T6). OTP_DEV_CODE solo se admite fuera de production.
      useFactory: (config: AppConfigService) =>
        config.get('OTP_DEV_CODE', { infer: true })
          ? new DevOtpSender()
          : new UnavailableOtpSender(),
    },
  ],
  exports: [ACCESS_TOKEN_VERIFIER],
})
export class AuthModule {}
