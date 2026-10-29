export const MEMBER_HISTORY = Symbol('MEMBER_HISTORY');

/** Historial de pago del usuario, que decide su confianza (COPAYNI-60, R18). */
export interface MemberHistoryPort {
  /** Círculos que terminaron con el usuario como miembro, sin haber sido expulsado. */
  completedCirclesOf(userId: string): Promise<number>;
}
