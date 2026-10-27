import { ApiProperty } from '@nestjs/swagger';

/** Sin versiones, dependencias ni tiempos: el health check es público. */
export class HealthResponse {
  @ApiProperty({ example: 'ok' })
  readonly status = 'ok' as const;
}
