import { type Cadence } from '../../domain/value-objects/cadence';

export const CIRCLE_ASSIGNMENT = Symbol('CIRCLE_ASSIGNMENT');
export const SLOT_PRICING = Symbol('SLOT_PRICING');

/**
 * Regla provisional para elegir el círculo (pending-scope R2), desde la configuración.
 * - `fill_oldest`: el círculo abierto más antiguo con esas condiciones, que todavía no empezó y
 *   donde el usuario no es miembro. Completa círculos antes de abrir otros, así empiezan antes.
 *   Si no hay, uno nuevo.
 * - `always_new`: siempre uno nuevo.
 *
 * Vive en su propio módulo, y no junto al caso de uso que la estrenó, porque la consultan varios
 * casos de uso y uno de ellos (las cuotas, COPAYNI-125) cerraría un ciclo de imports al tomarla
 * de allí.
 */
export interface CircleAssignmentSettings {
  readonly strategy: 'fill_oldest' | 'always_new';
  /**
   * Cadencias que se pueden crear (`CIRCLE_CADENCES_ENABLED`, COPAYNI-121). Las juntas que ya
   * existen no la consultan: deshabilitar una cadencia impide crear juntas nuevas, no detiene
   * las que están en curso.
   */
  readonly cadences: readonly Cadence[];
  /** Un círculo nuevo empieza este número de meses después del mes actual. */
  readonly startOffsetMonths: number;
  /** Zona horaria IANA que define el mes actual. */
  readonly timeZone: string;
}
