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
  OTP_CHANNELS,
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  REFRESH_TOKEN_REPOSITORY,
  ACCOUNT_ACCESS,
  REFRESH_TOKEN_SECRETS,
  type AuthPolicy,
  type OtpSenderPort,
} from './application/ports/auth.ports';
import {
  OTP_CHANNELS_VALUES,
  type OtpChannel,
} from '../users/domain/value-objects/login-identifier';
import {
  PASSCODE_HASHER,
  PASSCODE_POLICY,
  PASSCODE_REPOSITORY,
  type PasscodePolicy,
} from './application/ports/passcode.ports';
import { SessionIssuer } from './application/services/session-issuer';
import { SqlAccountAccess } from './infrastructure/persistence/sql-account-access';
import {
  APPLE_WEB_FLOW,
  EXTERNAL_IDENTITIES,
  GOOGLE_WEB_FLOW,
  IDENTITY_PROVIDERS_PORT,
  SOCIAL_AUTH_FLOWS,
  SOCIAL_AUTH_SETTINGS,
  type SocialAuthSettings,
} from './application/ports/social-auth.ports';
import {
  CompleteAppleWebFlowUseCase,
  ExchangeSocialCodeUseCase,
  StartAppleWebFlowUseCase,
} from './application/use-cases/apple-web-flow.use-cases';
import {
  CompleteGoogleWebFlowUseCase,
  StartGoogleWebFlowUseCase,
} from './application/use-cases/google-web-flow.use-cases';
import { ListConfiguredProvidersUseCase } from './application/use-cases/social-providers.use-cases';
import {
  LinkSocialIdentityUseCase,
  ListSocialIdentitiesUseCase,
  SocialLoginUseCase,
  UnlinkSocialIdentityUseCase,
} from './application/use-cases/social-login.use-cases';
import {
  AppleWebFlowAdapter,
  parseApplePrivateKey,
} from './infrastructure/social/apple-web-flow.adapter';
import { GoogleWebFlowAdapter } from './infrastructure/social/google-web-flow.adapter';
import {
  AppleIdentityAdapter,
  GoogleIdentityAdapter,
  IdentityProviders,
} from './infrastructure/social/provider.adapters';
import {
  SqlExternalIdentities,
  SqlSocialAuthFlows,
} from './infrastructure/persistence/typeorm/sql-external-identities';
import { HttpJwks } from '../../shared/infrastructure/crypto/http-jwks';
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
import {
  SocialAuthController,
  SocialIdentitiesController,
} from './presentation/http/controllers/social-auth.controller';
import { ContactChangeController } from './presentation/http/controllers/contact-change.controller';
import { PasscodeController } from './presentation/http/controllers/passcode.controller';
import {
  StartContactChangeUseCase,
  VerifyContactChangeUseCase,
} from './application/use-cases/contact-change.use-cases';
import { SqlContactChangeRepository } from './infrastructure/persistence/typeorm/sql-contact-change.repository';

const JWT_SETTINGS = Symbol('JWT_SETTINGS');
/** Interno: el envío y los canales salen de la misma elección, que solo se hace una vez. */
const OTP_DELIVERY = Symbol('OTP_DELIVERY');
const logger = new Logger('Auth');

/** JWKS de los proveedores: se reutilizan 10 min y un `kid` nuevo no dispara más de 1 descarga/30 s. */
const JWKS_CACHE_SECONDS = 600;
const JWKS_MIN_REFRESH_SECONDS = 30;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

/** Lista de client id separados por coma; vacío deja el proveedor apagado. */
const audiences = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

function socialAuthSettings(config: AppConfigService): SocialAuthSettings {
  return {
    flowTtlSeconds: config.get('SOCIAL_FLOW_TTL_SECONDS', { infer: true }),
    appRedirectUri: config.get('SOCIAL_APP_REDIRECT_URI', { infer: true }),
    apple: {
      authorizationUrl: 'https://appleid.apple.com/auth/authorize',
      serviceId: config.get('APPLE_SERVICE_ID', { infer: true }) ?? '',
      redirectUri: config.get('APPLE_REDIRECT_URI', { infer: true }) ?? '',
    },
    google: {
      authorizationUrl: GOOGLE_AUTHORIZATION_URL,
      clientId: config.get('GOOGLE_WEB_CLIENT_ID', { infer: true }) ?? '',
      redirectUri: config.get('GOOGLE_REDIRECT_URI', { infer: true }) ?? '',
    },
  };
}

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
  controllers: [
    AuthController,
    ContactChangeController,
    PasscodeController,
    SocialAuthController,
    SocialIdentitiesController,
  ],
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
    SocialLoginUseCase,
    LinkSocialIdentityUseCase,
    UnlinkSocialIdentityUseCase,
    ListSocialIdentitiesUseCase,
    ListConfiguredProvidersUseCase,
    StartAppleWebFlowUseCase,
    CompleteAppleWebFlowUseCase,
    StartGoogleWebFlowUseCase,
    CompleteGoogleWebFlowUseCase,
    ExchangeSocialCodeUseCase,
    SqlExternalIdentities,
    SqlSocialAuthFlows,
    { provide: EXTERNAL_IDENTITIES, useExisting: SqlExternalIdentities },
    { provide: SOCIAL_AUTH_FLOWS, useExisting: SqlSocialAuthFlows },
    { provide: SOCIAL_AUTH_SETTINGS, inject: [ConfigService], useFactory: socialAuthSettings },
    {
      // Un proveedor sin client id configurados queda apagado y responde 503 (COPAYNI-91 §3).
      provide: IDENTITY_PROVIDERS_PORT,
      inject: [ConfigService, CLOCK],
      useFactory: (config: AppConfigService, clock: ClockPort) =>
        new IdentityProviders([
          new GoogleIdentityAdapter(
            { audiences: audiences(config.get('GOOGLE_CLIENT_IDS', { infer: true })) },
            new HttpJwks(
              {
                url: GOOGLE_JWKS_URL,
                cacheSeconds: JWKS_CACHE_SECONDS,
                minRefreshSeconds: JWKS_MIN_REFRESH_SECONDS,
              },
              clock,
            ),
            clock,
          ),
          new AppleIdentityAdapter(
            { audiences: audiences(config.get('APPLE_CLIENT_IDS', { infer: true })) },
            new HttpJwks(
              {
                url: APPLE_JWKS_URL,
                cacheSeconds: JWKS_CACHE_SECONDS,
                minRefreshSeconds: JWKS_MIN_REFRESH_SECONDS,
              },
              clock,
            ),
            clock,
          ),
        ]),
    },
    {
      provide: APPLE_WEB_FLOW,
      inject: [ConfigService, CLOCK],
      useFactory: (config: AppConfigService, clock: ClockPort) =>
        new AppleWebFlowAdapter(
          {
            tokenUrl: 'https://appleid.apple.com/auth/token',
            teamId: config.get('APPLE_TEAM_ID', { infer: true }) ?? '',
            keyId: config.get('APPLE_KEY_ID', { infer: true }) ?? '',
            serviceId: config.get('APPLE_SERVICE_ID', { infer: true }) ?? '',
            redirectUri: config.get('APPLE_REDIRECT_URI', { infer: true }) ?? '',
            privateKey: parseApplePrivateKey(config.get('APPLE_PRIVATE_KEY', { infer: true })),
            timeoutMs: config.get('SOCIAL_TIMEOUT_MS', { infer: true }),
          },
          clock,
        ),
    },
    {
      provide: GOOGLE_WEB_FLOW,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        new GoogleWebFlowAdapter({
          tokenUrl: GOOGLE_TOKEN_URL,
          clientId: config.get('GOOGLE_WEB_CLIENT_ID', { infer: true }) ?? '',
          clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? '',
          redirectUri: config.get('GOOGLE_REDIRECT_URI', { infer: true }) ?? '',
          timeoutMs: config.get('SOCIAL_TIMEOUT_MS', { infer: true }),
        }),
    },
    ResendOtpUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    SessionIssuer,
    TypeOrmAuthChallengeRepository,
    TypeOrmRefreshTokenRepository,
    { provide: AUTH_CHALLENGE_REPOSITORY, useExisting: TypeOrmAuthChallengeRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: TypeOrmRefreshTokenRepository },
    { provide: ACCOUNT_ACCESS, useClass: SqlAccountAccess },
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
      provide: OTP_DELIVERY,
      inject: [ConfigService],
      // Envío real con OTP_DELIVERY=aws (T6). OTP_DEV_CODE solo se admite fuera de production.
      useFactory: (config: AppConfigService) => {
        const devCode = config.get('OTP_DEV_CODE', { infer: true });
        const { sender, activeChannels } = selectOtpSender({
          delivery: config.get('OTP_DELIVERY', { infer: true }),
          devCode,
          region: config.get('AWS_REGION', { infer: true }),
          codeTtlSeconds: config.get('OTP_CODE_TTL_SECONDS', { infer: true }),
          emailFrom: config.get('OTP_EMAIL_FROM', { infer: true }),
          sesConfigurationSet: config.get('OTP_SES_CONFIGURATION_SET', { infer: true }),
          sesEndpoint: config.get('OTP_SES_ENDPOINT', { infer: true }),
          smsOriginationIdentity: config.get('OTP_SMS_ORIGINATION_IDENTITY', { infer: true }),
          smsConfigurationSet: config.get('OTP_SMS_CONFIGURATION_SET', { infer: true }),
        });
        logger.log({ event: 'auth.otp_delivery', channels: activeChannels });
        // Con el código fijo de desarrollo no se envía nada, pero los dos canales valen: la app
        // debe seguir ofreciendo correo y teléfono.
        return { sender, channels: devCode ? [...OTP_CHANNELS_VALUES] : activeChannels };
      },
    },
    {
      provide: OTP_SENDER,
      inject: [OTP_DELIVERY],
      useFactory: (delivery: { sender: OtpSenderPort }) => delivery.sender,
    },
    {
      provide: OTP_CHANNELS,
      inject: [OTP_DELIVERY],
      useFactory: (delivery: { channels: OtpChannel[] }) => delivery.channels,
    },
  ],
  // Los puertos de OTP los reutiliza la firma del contrato y del pagaré (COPAYNI-89).
  exports: [
    ACCESS_TOKEN_VERIFIER,
    AUTH_POLICY,
    OTP_CHANNELS,
    OTP_GENERATOR,
    OTP_HASHER,
    OTP_SENDER,
  ],
})
export class AuthModule {}
