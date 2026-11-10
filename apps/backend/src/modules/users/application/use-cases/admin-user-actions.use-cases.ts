import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  ADMIN_USER_ACTIONS,
  type AdminUserActionsPort,
  type SupportNote,
  type UserContact,
} from '../ports/admin-user-actions.port';

const notFound = (): NotFoundError => new NotFoundError('No existe esa persona', 'USER_NOT_FOUND');

/** Toda acción de soporte lleva motivo: la auditoría lo guarda (no se escribe en los logs). */
function assertReason(reason: string): void {
  if (!reason.trim()) throw new ValidationError('Escribe el motivo', { reason: 'required' });
}

/**
 * `POST /admin/v1/users/:userId/sessions/revoke`: cierra todas las sesiones de la persona (p. ej.
 * ante un teléfono robado). El access token vigente dura hasta su vencimiento (15 min por defecto).
 */
@Injectable()
export class RevokeUserSessionsUseCase {
  private readonly logger = new Logger('AdminUsers');

  constructor(
    @Inject(ADMIN_USER_ACTIONS) private readonly actions: AdminUserActionsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(userId: string, reason: string): Promise<{ revokedSessions: number }> {
    assertReason(reason);
    const revoked = await this.actions.revokeSessions(userId, this.clock.now());
    if (revoked === null) throw notFound();
    this.logger.log({ event: 'users.sessions_revoked', userId, revoked });
    return { revokedSessions: revoked };
  }
}

/**
 * `POST /admin/v1/users/:userId/block` y `/unblock`. Bloquear revoca las sesiones y deja a la
 * persona sin poder abrir otra hasta que la desbloqueen. Es idempotente: `changed: false` si ya
 * estaba así.
 */
@Injectable()
export class SetUserBlockedUseCase {
  private readonly logger = new Logger('AdminUsers');

  constructor(
    @Inject(ADMIN_USER_ACTIONS) private readonly actions: AdminUserActionsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(props: {
    userId: string;
    action: 'block' | 'unblock';
    reason: string;
  }): Promise<{ blocked: boolean; changed: boolean; revokedSessions: number }> {
    assertReason(props.reason);
    const result = await this.actions.setBlocked(
      props.userId,
      props.action === 'block' ? { reason: props.reason.trim() } : null,
      this.clock.now(),
    );
    if (!result) throw notFound();
    this.logger.log({
      event: props.action === 'block' ? 'users.blocked' : 'users.unblocked',
      userId: props.userId,
      changed: result.changed,
    });
    return { blocked: props.action === 'block', ...result };
  }
}

/**
 * `POST /admin/v1/users/:userId/pii/reveal`: el dato completo, con motivo, autenticación reciente
 * y auditoría (Ley 29733). No queda en caché ni en los logs.
 */
@Injectable()
export class RevealUserContactUseCase {
  constructor(@Inject(ADMIN_USER_ACTIONS) private readonly actions: AdminUserActionsPort) {}

  async execute(userId: string, reason: string): Promise<UserContact> {
    assertReason(reason);
    const contact = await this.actions.contact(userId);
    if (!contact) throw notFound();
    return contact;
  }
}

/** `GET` y `POST /admin/v1/users/:userId/notes`: historial de atención, de solo inserción. */
@Injectable()
export class SupportNotesUseCase {
  constructor(@Inject(ADMIN_USER_ACTIONS) private readonly actions: AdminUserActionsPort) {}

  list(userId: string): Promise<SupportNote[]> {
    return this.actions.notes(userId);
  }

  async add(props: {
    userId: string;
    body: string;
    authorId: string;
    authorEmail: string | null;
  }): Promise<SupportNote> {
    const note = await this.actions.addNote({ ...props, body: props.body.trim() });
    if (!note) throw notFound();
    return note;
  }
}
