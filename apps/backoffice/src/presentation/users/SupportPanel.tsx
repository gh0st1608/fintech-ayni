import { useState } from 'react';

import { MAX_REASON_LENGTH } from '@/application/usecases';
import { AppError } from '@/domain/shared/AppError';
import { can } from '@/domain/staff/Staff';
import { MAX_NOTE_LENGTH, type UserContact, type UserDetail } from '@/domain/users/User';

import {
  Button,
  Dialog,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime } from '../format';
import { useSession, useStaff } from '../providers/AppProviders';
import {
  useAddSupportNote,
  useRevealContact,
  useRevokeSessions,
  useSetBlocked,
  useSupportNotes,
} from './useUsers';

type Action = 'revoke' | 'block' | 'unblock' | 'reveal';

const COPY: Record<Action, { button: string; title: string; hint: string }> = {
  revoke: {
    button: 'Cerrar sesiones',
    title: 'Cerrar todas las sesiones',
    hint: 'La persona tendrá que volver a ingresar. Puede hacerlo: cerrar sesiones no la bloquea.',
  },
  block: {
    button: 'Bloquear',
    title: 'Bloquear la cuenta',
    hint: 'Se cierran sus sesiones y no podrá volver a ingresar hasta que la desbloqueen.',
  },
  unblock: {
    button: 'Desbloquear',
    title: 'Desbloquear la cuenta',
    hint: 'Podrá volver a ingresar. Pide una autenticación reciente.',
  },
  reveal: {
    button: 'Ver dato completo',
    title: 'Ver el dato completo',
    hint: 'Queda en la auditoría con tu usuario y el motivo. Pide una autenticación reciente.',
  },
};

/**
 * Acciones de soporte sobre una persona (docs/backoffice-plan.md, fase 2): cerrar sesiones,
 * bloquear o desbloquear y ver el dato completo, siempre con motivo. Cada una queda en la
 * auditoría del backend; desbloquear y ver el dato piden autenticación reciente.
 */
export function SupportActions({ user }: { user: UserDetail }) {
  const staff = useStaff();
  const [open, setOpen] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const support = can(staff, 'users.support');
  const reveal = can(staff, 'users.reveal');
  if (!support && !reveal) return null;

  const actions: Action[] = [
    ...(support ? (['revoke', user.blocked ? 'unblock' : 'block'] as const) : []),
    ...(reveal ? (['reveal'] as const) : []),
  ];

  return (
    <section aria-labelledby="support" className="flex flex-col gap-2">
      <h2 id="support" className="text-lg font-semibold">
        Acciones de soporte
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'block' ? 'danger' : 'secondary'}
            onClick={() => {
              setDone(null);
              setOpen(action);
            }}
          >
            {COPY[action].button}
          </Button>
        ))}
      </div>
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
      {open && (
        <ActionDialog
          user={user}
          action={open}
          onClose={() => setOpen(null)}
          onDone={(message) => {
            setOpen(null);
            setDone(message);
          }}
        />
      )}
    </section>
  );
}

function ActionDialog({
  user,
  action,
  onClose,
  onDone,
}: {
  user: UserDetail;
  action: Action;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState<UserContact | null>(null);
  const revoke = useRevokeSessions(user.userId);
  const block = useSetBlocked(user.userId);
  const reveal = useRevealContact(user.userId);
  const { signOut } = useSession();
  const mutation = action === 'revoke' ? revoke : action === 'reveal' ? reveal : block;
  const error = mutation.error;
  const stepUp = error instanceof AppError && error.kind === 'step_up_required';
  const fieldError =
    error instanceof AppError && error.kind === 'validation' ? error.message : null;
  const copy = COPY[action];

  const submit = () => {
    if (action === 'revoke') {
      revoke.mutate(reason, {
        onSuccess: ({ revokedSessions }) =>
          onDone(
            revokedSessions === 1
              ? 'Se cerró 1 sesión.'
              : `Se cerraron ${String(revokedSessions)} sesiones.`,
          ),
      });
    } else if (action === 'reveal') {
      reveal.mutate(reason, { onSuccess: setContact });
    } else {
      block.mutate(
        { action, reason },
        {
          onSuccess: (result) =>
            onDone(
              !result.changed
                ? 'La cuenta ya estaba así.'
                : action === 'block'
                  ? 'La cuenta quedó bloqueada y sus sesiones se cerraron.'
                  : 'La cuenta se desbloqueó.',
            ),
        },
      );
    }
  };

  return (
    <Dialog open title={copy.title} onClose={onClose}>
      {contact ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-3">
            <div>
              <dt className="text-xs text-ink-soft">Nombre</dt>
              <dd className="font-medium">
                {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Email</dt>
              <dd className="font-medium">{contact.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Teléfono</dt>
              <dd className="font-medium">{contact.phone ?? '—'}</dd>
            </div>
          </dl>
          <p className="text-xs text-ink-soft">Al cerrar, el dato deja de mostrarse.</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p className="text-sm">{copy.hint}</p>
          <Field
            label="Motivo"
            error={fieldError}
            hint="Queda en la auditoría junto con tu usuario."
          >
            {(field) => (
              <textarea
                {...field}
                className={inputClass}
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          {mutation.isError && !fieldError && <ErrorAlert error={error} />}
          <div className="flex justify-end gap-2">
            {stepUp ? (
              <Button onClick={signOut}>Volver a iniciar sesión</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant={action === 'block' ? 'danger' : 'primary'}
                  loading={mutation.isPending}
                >
                  Confirmar
                </Button>
              </>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Historial de atención: lo leen todos los que ven a la persona; no se edita ni se borra. */
export function SupportNotes({ userId }: { userId: string }) {
  const staff = useStaff();
  const notes = useSupportNotes(userId);
  const add = useAddSupportNote(userId);
  const [body, setBody] = useState('');
  const fieldError =
    add.error instanceof AppError && add.error.kind === 'validation' ? add.error.message : null;

  return (
    <section aria-labelledby="notes" className="flex flex-col gap-3">
      <h2 id="notes" className="text-lg font-semibold">
        Notas de soporte
      </h2>
      {can(staff, 'users.support') && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate(body, { onSuccess: () => setBody('') });
          }}
        >
          <Field label="Nueva nota" error={fieldError} hint="No se puede editar ni borrar después.">
            {(field) => (
              <textarea
                {...field}
                className={inputClass}
                rows={2}
                maxLength={MAX_NOTE_LENGTH}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            )}
          </Field>
          {add.isError && !fieldError && <ErrorAlert error={add.error} />}
          <div>
            <Button type="submit" variant="secondary" loading={add.isPending}>
              Agregar nota
            </Button>
          </div>
        </form>
      )}
      {notes.isPending && <Spinner label="Cargando notas" />}
      {notes.isError && <ErrorAlert error={notes.error} onRetry={() => void notes.refetch()} />}
      {notes.isSuccess && notes.data.length === 0 && <EmptyState title="Todavía no hay notas" />}
      {notes.isSuccess && notes.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {notes.data.map((note) => (
            <li key={note.id} className="rounded-md border border-line bg-surface p-3">
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {note.authorEmail ?? note.authorId} · {formatDateTime(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
