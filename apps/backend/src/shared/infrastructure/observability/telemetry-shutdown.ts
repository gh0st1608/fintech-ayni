import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { activeTelemetry } from './telemetry';

/**
 * Al cerrar la app (SIGTERM, con `enableShutdownHooks`) envía las trazas, métricas y logs
 * pendientes antes de que termine el proceso.
 */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await activeTelemetry()?.shutdown();
  }
}
