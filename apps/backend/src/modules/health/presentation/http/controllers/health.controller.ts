import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { CheckReadinessUseCase } from '../../../application/use-cases/check-readiness.use-case';
import { HealthResponse } from '../dto/health.response';

/**
 * Probes del orquestador, sin versión (`/health/...`), sin autenticación y sin rate limit.
 * - live: el proceso responde. No consulta dependencias: si fallara por ellas, el orquestador
 *   reiniciaría la API sin resolver nada.
 * - ready: puede atender tráfico (sus dependencias responden). Si no, 503 y se le deja de
 *   enviar tráfico hasta que se recupere.
 */
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(CheckReadinessUseCase) private readonly checkReadiness: CheckReadinessUseCase,
  ) {}

  @Get('live')
  @ApiOkResponse({ type: HealthResponse, description: 'Envuelto en { success, data, traceId }' })
  live(): HealthResponse {
    return new HealthResponse();
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiServiceUnavailableResponse({
    description: 'Alguna dependencia no responde (SERVICE_UNAVAILABLE)',
  })
  async ready(): Promise<HealthResponse> {
    const { ready, failing } = await this.checkReadiness.execute();
    if (!ready) {
      // Qué falló queda en los logs, no en la respuesta.
      this.logger.warn({ message: 'La API no está lista', failing });
      throw new ServiceUnavailableException();
    }
    return new HealthResponse();
  }
}
