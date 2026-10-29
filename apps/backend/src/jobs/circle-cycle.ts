/**
 * Tarea diaria del ciclo mensual de los círculos (COPAYNI-56). En los ambientes desplegados la
 * lanza EventBridge Scheduler como tarea ECS con la misma imagen (docs/architecture.md). Volver a
 * ejecutarla el mismo día no duplica cobros ni payouts. Termina con código 1 si algún círculo
 * falló, para que el scheduler lo registre. Al final revisa el saldo mínimo del fondo de garantía
 * (COPAYNI-58): un fondo bajo alerta, pero no hace fallar la tarea.
 *
 *   node dist/jobs/circle-cycle.js
 */
import '../instrumentation';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { type AppConfigService } from '../config/configuration';
import { AdvanceCircleCyclesUseCase } from '../modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { CheckGuaranteeFundUseCase } from '../modules/circles/application/use-cases/check-guarantee-fund.use-case';
import { createLogger } from '../shared/infrastructure/observability/logger';
import { PinoNestLogger } from '../shared/infrastructure/observability/pino-nest-logger';

async function run(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
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
  try {
    const result = await app.get(AdvanceCircleCyclesUseCase).execute();
    Logger.log({ event: 'circles.cycle.run', ...result }, 'CircleCycle');
    await app.get(CheckGuaranteeFundUseCase).execute();
    return result.failed === 0;
  } finally {
    await app.close();
  }
}

run()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error: unknown) => {
    Logger.error(error instanceof Error ? error.message : 'Error en el ciclo', 'CircleCycle');
    process.exit(1);
  });
