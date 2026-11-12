import { useState } from 'react';

import { MAX_REASON_LENGTH } from '@/application/usecases';
import {
  type Approval,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUSES,
  type ApprovalStatus,
  FUND_MOVEMENT_KINDS,
  type FundMovementKind,
  isSameStaff,
  MOVEMENT_KIND_LABELS,
} from '@/domain/finance/Approval';
import { AppError } from '@/domain/shared/AppError';

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
import { formatDateTime, formatMoney } from '../format';
import { useSession, useStaff } from '../providers/AppProviders';
import { useApprovals, useDecideApproval, useProposeMovement } from './useFinance';

const STATUS_TONE: Record<ApprovalStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'neutral',
};

/**
 * Movimientos manuales del fondo con doble aprobación (COPAYNI-73): proponer el capital semilla o
 * una corrección y decidir las propuestas de otras personas. Nada se mueve sin la segunda persona.
 */
export function ApprovalsView() {
  const [status, setStatus] = useState<ApprovalStatus | undefined>('pending');
  const [proposing, setProposing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const approvals = useApprovals(status);
  const items = approvals.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Estado">
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={status ?? ''}
              onChange={(event) =>
                setStatus((event.target.value || undefined) as ApprovalStatus | undefined)
              }
            >
              <option value="">Todas</option>
              {APPROVAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {APPROVAL_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button
          onClick={() => {
            setDone(null);
            setProposing(true);
          }}
        >
          Proponer movimiento
        </Button>
      </div>
      <p className="text-sm text-ink-soft">
        Otra persona de Finanzas o el admin general tiene que aprobarlo. Las propuestas vencen si
        nadie las decide.
      </p>
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
      {approvals.isPending && <Spinner label="Cargando las propuestas" />}
      {approvals.isError && items.length === 0 && (
        <ErrorAlert error={approvals.error} onRetry={() => void approvals.refetch()} />
      )}
      {approvals.isSuccess && items.length === 0 && (
        <EmptyState title="No hay propuestas con ese estado" />
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Propuestas">
          {items.map((approval) => (
            <li key={approval.id}>
              <ApprovalCard approval={approval} onDone={setDone} />
            </li>
          ))}
        </ul>
      )}
      {approvals.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={approvals.isFetchingNextPage}
            onClick={() => void approvals.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
      {proposing && (
        <ProposeDialog
          onClose={() => setProposing(false)}
          onDone={() => {
            setProposing(false);
            setStatus('pending');
            setDone('La propuesta quedó pendiente de aprobación.');
          }}
        />
      )}
    </div>
  );
}

function ApprovalCard({
  approval,
  onDone,
}: {
  approval: Approval;
  onDone: (message: string) => void;
}) {
  const staff = useStaff();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const own = isSameStaff(approval.proposedBy, staff);
  const { movement } = approval;

  return (
    <article className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {MOVEMENT_KIND_LABELS[movement.kind]} · {formatMoney(movement.amount)}
          </p>
          <p className="text-sm">{movement.reason}</p>
        </div>
        <Badge tone={STATUS_TONE[approval.status]}>{APPROVAL_STATUS_LABELS[approval.status]}</Badge>
      </div>
      <p className="text-xs text-ink-soft">
        Propuso {approval.proposedBy.email ?? approval.proposedBy.staffId} el{' '}
        {formatDateTime(approval.proposedAt)}
        {approval.status === 'pending' && ` · Vence el ${formatDateTime(approval.expiresAt)}`}
      </p>
      {approval.decidedBy && approval.decidedAt && (
        <p className="text-xs text-ink-soft">
          {approval.status === 'approved' ? 'Aprobó' : 'Rechazó'}{' '}
          {approval.decidedBy.email ?? approval.decidedBy.staffId} el{' '}
          {formatDateTime(approval.decidedAt)}
          {approval.decisionReason && `. Motivo: ${approval.decisionReason}`}
        </p>
      )}
      {approval.status === 'pending' &&
        (own ? (
          <p className="text-xs text-ink-soft">Es tu propuesta: la decide otra persona.</p>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => setDeciding('approve')}>Aprobar</Button>
            <Button variant="danger" onClick={() => setDeciding('reject')}>
              Rechazar
            </Button>
          </div>
        ))}
      {deciding && (
        <DecideDialog
          key={deciding}
          approval={approval}
          action={deciding}
          onClose={() => setDeciding(null)}
          onDone={(message) => {
            setDeciding(null);
            onDone(message);
          }}
        />
      )}
    </article>
  );
}

function DecideDialog({
  approval,
  action,
  onClose,
  onDone,
}: {
  approval: Approval;
  action: 'approve' | 'reject';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const decide = useDecideApproval(approval.id);
  const { signOut } = useSession();
  const [reason, setReason] = useState('');
  const stepUp = decide.error instanceof AppError && decide.error.kind === 'step_up_required';
  const amount = formatMoney(approval.movement.amount);

  return (
    <Dialog
      open
      title={action === 'approve' ? 'Aprobar el movimiento' : 'Rechazar la propuesta'}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          decide.mutate(action === 'approve' ? { action } : { action, reason }, {
            onSuccess: () =>
              onDone(
                action === 'approve'
                  ? `Se registró el movimiento de ${amount} en el fondo.`
                  : 'La propuesta quedó rechazada.',
              ),
          });
        }}
      >
        <p className="text-sm">
          {action === 'approve'
            ? `Se registrará ${MOVEMENT_KIND_LABELS[approval.movement.kind].toLowerCase()} por ${amount} en el fondo de garantía. No se puede deshacer: una corrección es otro movimiento. Pide una autenticación reciente.`
            : 'No se moverá dinero. El motivo queda en la auditoría.'}
        </p>
        {action === 'reject' && (
          <Field label="Motivo">
            {(field) => (
              <textarea
                {...field}
                className={inputClass}
                rows={2}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
        )}
        {decide.isError && <ErrorAlert error={decide.error} />}
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
                variant={action === 'approve' ? 'primary' : 'danger'}
                loading={decide.isPending}
              >
                Confirmar
              </Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function ProposeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const propose = useProposeMovement();
  const [kind, setKind] = useState<FundMovementKind>('seed_capital');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PEN');
  const [reason, setReason] = useState('');

  return (
    <Dialog open title="Proponer un movimiento del fondo" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          propose.mutate({ kind, amount, currency, reason }, { onSuccess: onDone });
        }}
      >
        <Field label="Tipo">
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={kind}
              onChange={(event) => setKind(event.target.value as FundMovementKind)}
            >
              {FUND_MOVEMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {MOVEMENT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field
              label="Monto"
              hint={kind === 'adjustment' ? 'Negativo si sale del fondo.' : 'Entra al fondo.'}
            >
              {(field) => (
                <input
                  {...field}
                  className={inputClass}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Moneda">
            {(field) => (
              <input
                {...field}
                className={inputClass}
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            )}
          </Field>
        </div>
        <Field label="Motivo" hint="Por ejemplo, el acta o el caso que lo justifica.">
          {(field) => (
            <textarea
              {...field}
              className={inputClass}
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {propose.isError && <ErrorAlert error={propose.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={propose.isPending}>
            Proponer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
