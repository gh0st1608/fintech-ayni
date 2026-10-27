export const READINESS_INDICATORS = Symbol('READINESS_INDICATORS');

/**
 * Dependencia sin la cual la API no puede atender peticiones (p. ej. la base de datos). Cada
 * adaptador que la necesite registra su indicador en HealthModule.
 */
export interface ReadinessIndicator {
  /** Nombre interno para los logs; nunca se devuelve al cliente. */
  readonly name: string;
  /** Resuelve si la dependencia responde; rechazar equivale a no estar lista. */
  isReady(): Promise<boolean>;
}
