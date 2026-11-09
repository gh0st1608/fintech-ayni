import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { MAX_REASON_LENGTH } from '@/application/usecases';
import { type CircleDetail, type PauseAction, pauseActionFor } from '@/domain/circles/Circle';
import { AppError } from '@/domain/shared/AppError';
import { can } from '@/domain/staff/Staff';

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime, formatDay, formatMoney, formatPeriod, STATE_LABELS } from '../format';
import { useSession, useStaff } from '../providers/AppProviders';
import { useCircle, useSetCirclePause } from './useCircles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detalle de una junta: condiciones, miembros (enmascarados) y la propuesta de inicio. */
export function CircleDetailScreen() {
  const { circleId = '' } = useParams();
  if (!UUID.test(circleId)) {
    return <EmptyState title="Esa junta no existe" description="Revisa el enlace." />;
  }
  return <CircleDetailContent circleId={circleId} />;
}

function CircleDetailContent({ circleId }: { circleId: string }) {
  const circle = useCircle(circleId);
  if (circle.isPending) return <Spinner label="Cargando la junta" />;
  if (circle.isError) {
    if (circle.error instanceof AppError && circle.error.kind === 'not_found') {
      return <EmptyState title="Esa junta no existe" description="Puede que el enlace esté mal." />;
    }
    return <ErrorAlert error={circle.error} onRetry={() => void circle.refetch()} />;
  }
  return <CircleView circle={circle.data} />;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CircleView({ circle }: { circle: CircleDetail }) {
  const staff = useStaff();
  const action = pauseActionFor(circle.state);
  const canPause = can(staff, 'circles.pause') && action !== null;

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Ruta">
        <Link to="/circles" className="text-sm text-brand hover:underline">
          ← Juntas
        </Link>
      </nav>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Junta de {formatMoney(circle.payout)}</h1>
          <Badge tone={circle.state === 'paused' ? 'warning' : 'neutral'}>
            {STATE_LABELS[circle.state]}
          </Badge>
        </div>
        {canPause && <PauseControl circleId={circle.circleId} action={action} />}
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-4">
        <Info label="Turnos" value={`${circle.members} de ${circle.months}`} />
        <Info label="Inicio" value={formatPeriod(circle.startsOn)} />
        <Info
          label="Mes en curso"
          value={circle.currentPeriod ? formatPeriod(circle.currentPeriod) : '—'}
        />
        <Info label="Pausada desde" value={circle.pausedOn ? formatDay(circle.pausedOn) : '—'} />
      </dl>

      {circle.startProposal && (
        <section
          aria-labelledby="proposal"
          className="rounded-md border border-warning/50 bg-warning/5 p-4"
        >
          <h2 id="proposal" className="mb-2 font-semibold">
            Propuesta de inicio reducido (ronda {circle.startProposal.round})
          </h2>
          <p className="text-sm">
            {circle.startProposal.months} turnos con un pozo de{' '}
            {formatMoney(circle.startProposal.payout)}. Plazo:{' '}
            {formatDay(circle.startProposal.respondBy)}. Aceptaron {circle.startProposal.accepted} y
            se retiraron {circle.startProposal.withdrawn}.
          </p>
        </section>
      )}

      <section aria-labelledby="members" className="flex flex-col gap-2">
        <h2 id="members" className="text-lg font-semibold">
          Miembros
        </h2>
        <p className="text-xs text-ink-soft">Los datos personales se muestran enmascarados.</p>
        {circle.memberships.length === 0 ? (
          <EmptyState title="Todavía no hay miembros" />
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <caption className="sr-only">Miembros de la junta</caption>
              <thead className="bg-muted text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Turno
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Teléfono
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Se unió
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {circle.memberships.map((member) => (
                  <tr key={member.userId}>
                    <td className="px-4 py-2">
                      {member.position}
                      {member.expelledAt && (
                        <span className="ml-2">
                          <Badge tone="danger">Expulsado</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{member.name ?? '—'}</td>
                    <td className="px-4 py-2">{member.email ?? '—'}</td>
                    <td className="px-4 py-2">{member.phone ?? '—'}</td>
                    <td className="px-4 py-2">{formatDateTime(member.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

const ACTION_COPY: Record<PauseAction, { button: string; title: string; done: string }> = {
  pause: { button: 'Pausar junta', title: 'Pausar la junta', done: 'La junta quedó pausada.' },
  resume: { button: 'Reanudar junta', title: 'Reanudar la junta', done: 'La junta se reanudó.' },
};

/**
 * Pausa o reanuda con motivo obligatorio. El backend exige una autenticación reciente: si venció,
 * se ofrece volver a iniciar sesión.
 */
function PauseControl({ circleId, action }: { circleId: string; action: PauseAction }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const mutation = useSetCirclePause(circleId);
  const { signOut } = useSession();
  const copy = ACTION_COPY[action];
  const stepUp = mutation.error instanceof AppError && mutation.error.kind === 'step_up_required';
  const fieldError =
    mutation.error instanceof AppError && mutation.error.kind === 'validation'
      ? mutation.error.message
      : null;

  const close = () => {
    setOpen(false);
    setReason('');
    mutation.reset();
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant={action === 'pause' ? 'danger' : 'primary'}
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
      >
        {copy.button}
      </Button>
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
      <Dialog open={open} title={copy.title} onClose={close}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(
              { action, reason },
              {
                onSuccess: () => {
                  close();
                  setDone(copy.done);
                },
              },
            );
          }}
        >
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
          {mutation.isError && !fieldError && <ErrorAlert error={mutation.error} />}
          <div className="flex justify-end gap-2">
            {stepUp ? (
              <Button onClick={signOut}>Volver a iniciar sesión</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={close}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant={action === 'pause' ? 'danger' : 'primary'}
                  loading={mutation.isPending}
                >
                  Confirmar
                </Button>
              </>
            )}
          </div>
        </form>
      </Dialog>
    </div>
  );
}
