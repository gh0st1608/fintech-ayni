import { Module } from '@nestjs/common';

import {
  READINESS_INDICATORS,
  type ReadinessIndicator,
} from './application/ports/readiness-indicator.port';
import { CheckReadinessUseCase } from './application/use-cases/check-readiness.use-case';
import { HealthController } from './presentation/http/controllers/health.controller';

/** Todavía no hay dependencias externas; el indicador de la base de datos llega con COPAYNI-12. */
const indicators: ReadinessIndicator[] = [];

@Module({
  controllers: [HealthController],
  providers: [CheckReadinessUseCase, { provide: READINESS_INDICATORS, useValue: indicators }],
})
export class HealthModule {}
