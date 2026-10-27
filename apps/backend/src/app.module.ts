import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { type AppConfigService, configModuleOptions } from './config/configuration';
import { CirclesModule } from './modules/circles/circles.module';
import { ACCESS_TOKEN_VERIFIER } from './shared/application/ports/access-token-verifier.port';
import { DenyAllAccessTokenVerifier } from './shared/infrastructure/auth/deny-all-access-token-verifier';
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
    CirclesModule,
  ],
  providers: [
    { provide: ACCESS_TOKEN_VERIFIER, useClass: DenyAllAccessTokenVerifier },
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
