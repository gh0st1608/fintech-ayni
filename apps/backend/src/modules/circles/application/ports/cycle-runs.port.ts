export const CYCLE_RUNS = Symbol('CYCLE_RUNS');

/** Un círculo que falló en una ejecución: el resto siguió. */
export interface CycleRunFailure {
  circleId: string;
  reason: string;
}

/** Resumen de una ejecución de la tarea diaria del ciclo mensual. */
export interface CycleRun {
  id: string;
  /** `YYYY-MM-DD` en la zona del negocio. */
  businessDate: string;
  startedAt: Date;
  finishedAt: Date;
  advanced: number;
  locked: number;
  failed: number;
  failures: CycleRunFailure[];
}

/** Registro de las ejecuciones, para verlas en el back-office (hasta ahora solo en los logs). */
export interface CycleRunsPort {
  record(run: Omit<CycleRun, 'id'>): Promise<void>;
  list(filter: { limit: number; cursor: string | null }): Promise<{
    items: CycleRun[];
    nextCursor: string | null;
  }>;
}
