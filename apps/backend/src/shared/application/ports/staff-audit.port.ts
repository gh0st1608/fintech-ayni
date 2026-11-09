export const STAFF_AUDIT = Symbol('STAFF_AUDIT');

/** Una acción del personal en el back-office (docs/backoffice-plan.md §4). */
export interface StaffAuditEntry {
  actorId: string;
  actorEmail?: string;
  /** Qué hizo, p. ej. `circle.pause`. */
  action: string;
  /** Sobre qué, p. ej. `circle`. */
  entity: string;
  entityId?: string;
  outcome: 'succeeded' | 'failed';
  /** Solo los campos que la acción declara auditables: nunca el cuerpo completo ni PII. */
  details: Record<string, string>;
  traceId?: string;
  ip?: string;
}

export interface StaffAuditPort {
  record(entry: StaffAuditEntry): Promise<void>;
}
