/** Una ejecución de la tarea diaria del ciclo mensual (docs/api/admin.md). */
export interface CycleRun {
  id: string;
  /** `YYYY-MM-DD` en la zona del negocio. */
  businessDate: string;
  startedAt: Date;
  finishedAt: Date;
  advanced: number;
  /** Juntas que otra ejecución tenía bloqueadas. */
  locked: number;
  failed: number;
  failures: { circleId: string; reason: string }[];
}

export interface CycleRunsPage {
  items: CycleRun[];
  nextCursor: string | null;
}
