import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { type AppConfigService } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = configureApp(
    await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS),
  );
  const config = app.get<AppConfigService>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `${config.get('APP_NAME', { infer: true })} escuchando en el puerto ${port}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  // Fallos posteriores a la creación (p. ej. el puerto ya está en uso).
  Logger.error(error instanceof Error ? error.message : 'Error al iniciar', 'Bootstrap');
  process.exit(1);
});
