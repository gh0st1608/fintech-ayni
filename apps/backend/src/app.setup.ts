import { type NestApplicationOptions, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { type AppConfigService } from './config/configuration';
import { createLogger } from './shared/infrastructure/observability/logger';
import { PinoNestLogger } from './shared/infrastructure/observability/pino-nest-logger';
import { accessLogMiddleware, traceIdMiddleware } from './shared/presentation/http/app-request';

/**
 * Opciones de creación: body-parser se registra en `configureApp` con su límite. Si la
 * configuración es inválida, NestFactory registra el error de validación y termina el proceso.
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false, bufferLogs: true };

/**
 * Configuración HTTP común a `main.ts` y a las pruebas e2e: seguridad, límites,
 * versionado y documentación. Los filtros, pipes, guards e interceptores globales se
 * registran en AppModule.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get<AppConfigService>(ConfigService);

  app.useLogger(
    new PinoNestLogger(
      createLogger({
        APP_NAME: config.get('APP_NAME', { infer: true }),
        APP_VERSION: config.get('APP_VERSION', { infer: true }),
        DEPLOYMENT_ENVIRONMENT: config.get('DEPLOYMENT_ENVIRONMENT', { infer: true }),
        LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
      }),
    ),
  );
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.disable('x-powered-by');
  app.use(traceIdMiddleware);
  app.use(accessLogMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ALLOWED_ORIGINS', { infer: true }),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['x-trace-id', 'Retry-After'],
  });
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT', { infer: true }) });
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();

  if (config.get('ENABLE_SWAGGER', { infer: true })) {
    const document = new DocumentBuilder()
      .setTitle(config.get('APP_NAME', { infer: true }))
      .setVersion(config.get('APP_VERSION', { infer: true }))
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));
  }
  return app;
}
