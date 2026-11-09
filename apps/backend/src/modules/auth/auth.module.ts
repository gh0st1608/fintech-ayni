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
  CONTACT_CHANGES,
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  REFRESH_TOKEN_REPOSITORY,
  REFRESH_TOKEN_SECRETS,
  type AuthPolicy,
} from './application/ports/auth.ports';
import {
  PASSCODE_HASHER,
  PASSCODE_POLICY,
  PASSCODE_REPOSITORY,
  type PasscodePolicy,
} from './application/ports/passcode.ports';
import { SessionIssuer } from './application/services/session-issuer';
import {
  ResendOtpUseCase,
  StartAuthenticationUseCase,
  VerifyOtpUseCase,
} from './application/use-cases/otp.use-cases';
import {
  GetPasscodeStatusUseCase,
  PasscodeChecker,
  SetPasscodeUseCase,
  VerifyPasscodeUseCase,
} from './application/use-cases/passcode.use-cases';
import { LogoutUseCase, RefreshSessionUseCase } from './application/use-cases/session.use-cases';
import {
  Es256JwtIssuer,
  Es256JwtVerifier,
  type JwtSettings,
  parsePrivateKey,
} from './infrastructure/crypto/es256-jwt';
import {
  CryptoRefreshTokenSecrets,
  FixedOtpGenerator,
  HmacOtpHasher,
  RandomOtpGenerator,
} from './infrastructure/crypto/otp.adapters';
import { selectOtpSender } from './infrastructure/messaging/otp-sender.factory';
import { ScryptPasscodeHasher } from './infrastructure/crypto/scrypt-passcode-hasher';
import {
  AuthChallengeEntity,
  RefreshTokenEntity,
} from './infrastructure/persistence/typeorm/auth.entities';
import { SqlPasscodeRepository } from './infrastructure/persistence/typeorm/sql-passcode.repository';
import { TypeOrmAuthChallengeRepository } from './infrastructure/persistence/typeorm/typeorm-auth-challenge.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/persistence/typeorm/typeorm-refresh-token.repository';
import { AuthController } from './presentation/http/controllers/auth.controller';
import { ContactChangeController } from './presentation/http/controllers/contact-change.controller';
import { PasscodeController } from './presentation/http/controllers/passcode.controller';
import {
  StartContactChangeUseCase,
  VerifyContactChangeUseCase,
} from './application/use-cases/contact-change.use-cases';
import { SqlContactChangeRepository } from './infrastructure/persistence/typeorm/sql-contact-change.repository';

const JWT_SETTINGS = Symbol('JWT_SETTINGS');
const logger = new Logger('Auth');

function passcodePolicy(config: AppConfigService): PasscodePolicy {
  return {
    maxAttempts: config.get('PASSCODE_MAX_ATTEMPTS', { infer: true }),
    lockSeconds: config.get('PASSCODE_LOCK_SECONDS', { infer: true }),
  };
}

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
  controllers: [AuthController, ContactChangeController, PasscodeController],
  providers: [
    PasscodeChecker,
    GetPasscodeStatusUseCase,
    SetPasscodeUseCase,
    VerifyPasscodeUseCase,
    SqlPasscodeRepository,
    { provide: PASSCODE_REPOSITORY, useExisting: SqlPasscodeRepository },
    { provide: PASSCODE_HASHER, useClass: ScryptPasscodeHasher },
    { provide: PASSCODE_POLICY, inject: [ConfigService], useFactory: passcodePolicy },
    StartContactChangeUseCase,
    VerifyContactChangeUseCase,
    SqlContactChangeRepository,
    { provide: CONTACT_CHANGES, useExisting: SqlContactChangeRepository },
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
      // Envío real con OTP_DELIVERY=aws (T6). OTP_DEV_CODE solo se admite fuera de production.
      useFactory: (config: AppConfigService) => {
        const { sender, activeChannels } = selectOtpSender({
          delivery: config.get('OTP_DELIVERY', { infer: true }),
          devCode: config.get('OTP_DEV_CODE', { infer: true }),
          region: config.get('AWS_REGION', { infer: true }),
          codeTtlSeconds: config.get('OTP_CODE_TTL_SECONDS', { infer: true }),
          emailFrom: config.get('OTP_EMAIL_FROM', { infer: true }),
          sesConfigurationSet: config.get('OTP_SES_CONFIGURATION_SET', { infer: true }),
          sesEndpoint: config.get('OTP_SES_ENDPOINT', { infer: true }),
          smsOriginationIdentity: config.get('OTP_SMS_ORIGINATION_IDENTITY', { infer: true }),
          smsConfigurationSet: config.get('OTP_SMS_CONFIGURATION_SET', { infer: true }),
        });
        logger.log({ event: 'auth.otp_delivery', channels: activeChannels });
        return sender;
      },
    },
  ],
  exports: [ACCESS_TOKEN_VERIFIER],
})
export class AuthModule {}
