import { Module } from '@nestjs/common';

import { DatabaseReadinessIndicator } from '../../shared/infrastructure/persistence/database-readiness.indicator';
import {
  READINESS_INDICATORS,
  type ReadinessIndicator,
} from './application/ports/readiness-indicator.port';
import { CheckReadinessUseCase } from './application/use-cases/check-readiness.use-case';
import { HealthController } from './presentation/http/controllers/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    CheckReadinessUseCase,
    // Dependencias sin las que la API no atiende: hoy, PostgreSQL (DatabaseModule es global).
    {
      provide: READINESS_INDICATORS,
      inject: [DatabaseReadinessIndicator],
      useFactory: (database: DatabaseReadinessIndicator): ReadinessIndicator[] => [database],
    },
  ],
})
export class HealthModule {}
