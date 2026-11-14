import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { type AppConfigService } from '../config/configuration';
import { CLOCK, type ClockPort } from './application/ports/clock.port';
import { STAFF_AUDIT } from './application/ports/staff-audit.port';
import {
  STAFF_AUTHENTICATOR,
  type StaffAuthenticatorPort,
  type StaffRole,
} from './application/ports/staff-authenticator.port';
import { StaffSessionController } from './presentation/http/controllers/staff-session.controller';
import {
  STAFF_ACCESS_SETTINGS,
  StaffGuard,
  type StaffAccessSettings,
} from './presentation/guards/staff.guard';
import { StaffAuditInterceptor } from './presentation/interceptors/staff-audit.interceptor';
import { DEV_STAFF_TOKENS, DevStaffTokens } from './infrastructure/staff/dev-staff-tokens';
import { HttpJwks, OidcStaffAuthenticator } from './infrastructure/staff/oidc-staff-authenticator';
import { SqlStaffAuditLog } from './infrastructure/staff/sql-staff-audit-log';
import { UnconfiguredStaffAuthenticator } from './infrastructure/staff/unconfigured-staff-authenticator';

/** Claves del proveedor: se reutilizan 10 minutos y un `kid` desconocido no descarga más de 1/30 s. */
const JWKS_CACHE_SECONDS = 600;
const JWKS_MIN_REFRESH_SECONDS = 30;

/**
 * Acceso del personal a la API de administración (docs/backoffice-plan.md, fase 1): identidad
 * según `STAFF_AUTH_PROVIDER`, `StaffGuard` con step-up y auditoría. Global, para que cada módulo
 * exponga sus endpoints `/admin/v1` sin repetir esta configuración.
 */
@Global()
@Module({
  controllers: [StaffSessionController],
  providers: [
    StaffGuard,
    {
      provide: STAFF_ACCESS_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): StaffAccessSettings => ({
        stepUpMaxAgeSeconds: config.get('STAFF_STEP_UP_MAX_AGE_SECONDS', { infer: true }),
      }),
    },
    {
      provide: DEV_STAFF_TOKENS,
      inject: [ConfigService, CLOCK],
      useFactory: (config: AppConfigService, clock: ClockPort): DevStaffTokens | null =>
        config.get('STAFF_AUTH_PROVIDER', { infer: true }) === 'dev'
          ? new DevStaffTokens(clock)
          : null,
    },
    {
      provide: STAFF_AUTHENTICATOR,
      inject: [ConfigService, CLOCK, DEV_STAFF_TOKENS],
      useFactory: (
        config: AppConfigService,
        clock: ClockPort,
        devTokens: DevStaffTokens | null,
      ): StaffAuthenticatorPort => {
        if (devTokens) return devTokens;
        if (config.get('STAFF_AUTH_PROVIDER', { infer: true }) !== 'oidc') {
          return new UnconfiguredStaffAuthenticator();
        }
        const issuer = config.get('STAFF_OIDC_ISSUER', { infer: true })!.replace(/\/+$/, '');
        const jwksUrl =
          config.get('STAFF_OIDC_JWKS_URL', { infer: true }) ?? `${issuer}/.well-known/jwks.json`;
        const groupsMapRaw = config.get('STAFF_OIDC_GROUPS_MAP', { infer: true });
        const groupsMap = groupsMapRaw
          ? (JSON.parse(groupsMapRaw) as Record<string, StaffRole[]>)
          : undefined;
        return new OidcStaffAuthenticator(
          {
            issuer,
            audience: config.get('STAFF_OIDC_AUDIENCE', { infer: true }),
            rolesClaim: config.get('STAFF_OIDC_ROLES_CLAIM', { infer: true }),
            groupsMap,
          },
          new HttpJwks(
            {
              url: jwksUrl,
              cacheSeconds: JWKS_CACHE_SECONDS,
              minRefreshSeconds: JWKS_MIN_REFRESH_SECONDS,
            },
            clock,
          ),
          clock,
        );
      },
    },
    SqlStaffAuditLog,
    { provide: STAFF_AUDIT, useExisting: SqlStaffAuditLog },
    { provide: APP_INTERCEPTOR, useClass: StaffAuditInterceptor },
  ],
  exports: [StaffGuard, STAFF_AUTHENTICATOR, STAFF_ACCESS_SETTINGS, STAFF_AUDIT],
})
export class StaffAccessModule {}
