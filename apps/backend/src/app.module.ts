import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { type AppConfigService, configModuleOptions } from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { CirclesModule } from './modules/circles/circles.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { ClockModule } from './shared/infrastructure/clock/clock.module';
import { DatabaseModule } from './shared/infrastructure/persistence/database.module';
import { TelemetryShutdown } from './shared/infrastructure/observability/telemetry-shutdown';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { BearerAuthGuard } from './shared/presentation/guards/bearer-auth.guard';
import { ResponseEnvelopeInterceptor } from './shared/presentation/interceptors/response-envelope.interceptor';
import { TimeoutInterceptor } from './shared/presentation/interceptors/timeout.interceptor';
import { createValidationPipe } from './shared/presentation/pipes/validation.pipe';

@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    // En memoria: vale para una instancia. Con varias réplicas o Lambda necesita un
    // almacenamiento compartido (spike COPAYNI-11).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: config.get('RATE_LIMIT_TTL', { infer: true }),
          limit: config.get('RATE_LIMIT_MAX', { infer: true }),
        },
      ],
    }),
    ClockModule,
    DatabaseModule,
    HealthModule,
    // Exporta ACCESS_TOKEN_VERIFIER, que usa BearerAuthGuard.
    AuthModule,
    CirclesModule,
    PayoutsModule,
    PaymentsModule,
    ReferralsModule,
  ],
  providers: [
    TelemetryShutdown,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Orden: primero el rate limit (también protege las rutas públicas), luego la autenticación.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: BearerAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
