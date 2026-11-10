export const ADMIN_USER_ACTIONS = Symbol('ADMIN_USER_ACTIONS');

/** Una nota de soporte sobre una persona: de solo inserción. */
export interface SupportNote {
  id: string;
  body: string;
  authorId: string;
  authorEmail: string | null;
  createdAt: Date;
}

/** El dato completo de contacto, para revelarlo con motivo y auditoría. */
export interface UserContact {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Acciones de soporte del back-office sobre una persona (docs/backoffice-plan.md, fase 2). */
export interface AdminUserActionsPort {
  /** Revoca todas las sesiones vigentes. Devuelve cuántas había; `null` si la persona no existe. */
  revokeSessions(userId: string, now: Date): Promise<number | null>;
  /**
   * Bloquea (con motivo) o desbloquea, en una transacción: bloquear también revoca las sesiones.
   * `changed: false` si ya estaba así; `null` si la persona no existe.
   */
  setBlocked(
    userId: string,
    block: { reason: string } | null,
    now: Date,
  ): Promise<{ changed: boolean; revokedSessions: number } | null>;
  contact(userId: string): Promise<UserContact | null>;
  notes(userId: string): Promise<SupportNote[]>;
  /** `null` si la persona no existe. */
  addNote(note: {
    userId: string;
    body: string;
    authorId: string;
    authorEmail: string | null;
  }): Promise<SupportNote | null>;
}
