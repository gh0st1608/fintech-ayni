import { Inject, Injectable } from '@nestjs/common';

import { READINESS_INDICATORS, type ReadinessIndicator } from '../ports/readiness-indicator.port';

/** Tiempo máximo por indicador: un probe colgado no debe colgar el health check. */
export const READINESS_TIMEOUT_MS = 2000;

export interface ReadinessResult {
  ready: boolean;
  /** Indicadores que fallaron, para los logs. */
  failing: string[];
}

function withTimeout(check: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([check, timeout]).finally(() => clearTimeout(timer));
}

/** Consulta todos los indicadores en paralelo. Sin indicadores, la API está lista. */
@Injectable()
export class CheckReadinessUseCase {
  constructor(
    @Inject(READINESS_INDICATORS) private readonly indicators: readonly ReadinessIndicator[],
  ) {}

  async execute(timeoutMs = READINESS_TIMEOUT_MS): Promise<ReadinessResult> {
    const results = await Promise.all(
      this.indicators.map(async (indicator) => ({
        name: indicator.name,
        ready: await withTimeout(indicator.isReady(), timeoutMs).catch(() => false),
      })),
    );
    const failing = results.filter((result) => !result.ready).map((result) => result.name);
    return { ready: failing.length === 0, failing };
  }
}
