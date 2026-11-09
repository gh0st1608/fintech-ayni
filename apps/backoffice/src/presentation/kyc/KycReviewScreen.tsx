import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { MAX_REASON_LENGTH } from '@/application/usecases';
import {
  KYC_KIND_LABELS,
  KYC_PURPOSE_LABELS,
  KYC_STATUS_LABELS,
  KYC_TYPE_LABELS,
  type KycPageUrl,
  type KycReviewDetail,
  REJECTION_REASON_CODES,
  REJECTION_REASONS,
  type RejectionReason,
} from '@/domain/kyc/Kyc';
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
import { formatDateTime, formatMoney } from '../format';
import { useStaff } from '../providers/AppProviders';
import { useDecideKyc, useKycPageUrl, useKycReview, useRefreshKyc } from './useKyc';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "3200" o "3200.50" (en la moneda) → unidades menores. `null` si no es un monto válido. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/** Un documento de la cola: páginas, datos de la persona (enmascarados) y la decisión. */
export function KycReviewScreen() {
  const { id = '' } = useParams();
  if (!UUID.test(id)) {
    return <EmptyState title="Ese documento no existe" description="Revisa el enlace." />;
  }
  return <KycReviewContent id={id} />;
}

function KycReviewContent({ id }: { id: string }) {
  const review = useKycReview(id);
  if (review.isPending) return <Spinner label="Cargando el documento" />;
  if (review.isError) {
    if (review.error instanceof AppError && review.error.kind === 'not_found') {
      return (
        <EmptyState title="Ese documento no existe" description="Puede que el enlace esté mal." />
      );
    }
    return <ErrorAlert error={review.error} onRetry={() => void review.refetch()} />;
  }
  return <ReviewView review={review.data} />;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const STATUS_TONE = { in_review: 'warning', approved: 'success', rejected: 'danger' } as const;

function ReviewView({ review }: { review: KycReviewDetail }) {
  const staff = useStaff();
  const decidable = review.status === 'in_review' && can(staff, 'kyc.review');

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Ruta">
        <Link to="/kyc" className="text-sm text-brand hover:underline">
          ← Revisión de documentos
        </Link>
      </nav>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{KYC_TYPE_LABELS[review.type]}</h1>
          <Badge tone={STATUS_TONE[review.status]}>{KYC_STATUS_LABELS[review.status]}</Badge>
          {review.superseded && <Badge tone="warning">Hay uno más nuevo</Badge>}
        </div>
        {decidable && <DecisionControls review={review} />}
      </header>

      {review.superseded && review.status === 'in_review' && (
        <p role="note" className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
          La persona envió después otro documento de este tipo. Revisa también el más nuevo.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-4">
        <Info label="Tipo" value={KYC_KIND_LABELS[review.kind] ?? review.kind} />
        <Info label="Enviado" value={formatDateTime(review.submittedAt)} />
        <Info
          label="Ingreso declarado"
          value={review.monthlyIncome ? formatMoney(review.monthlyIncome) : '—'}
        />
        <Info label="Páginas" value={review.pages} />
      </dl>

      <section aria-labelledby="person" className="flex flex-col gap-2">
        <h2 id="person" className="text-lg font-semibold">
          Persona
        </h2>
        <p className="text-xs text-ink-soft">Los datos personales se muestran enmascarados.</p>
        <dl className="grid grid-cols-1 gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-3">
          <Info label="Nombre" value={review.subject.name ?? '—'} />
          <Info label="Email" value={review.subject.email ?? '—'} />
          <Info label="Teléfono" value={review.subject.phone ?? '—'} />
        </dl>
      </section>

      <PagesSection review={review} />

      {review.status !== 'in_review' && (
        <section
          aria-labelledby="decision"
          className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
        >
          <h2 id="decision" className="text-lg font-semibold">
            Decisión
          </h2>
          <p className="text-sm">
            {KYC_STATUS_LABELS[review.status]}
            {review.reviewedAt && ` el ${formatDateTime(review.reviewedAt)}`}
            {review.reviewedBy && ` por ${review.reviewedBy}`}.
          </p>
          {review.reason && (
            <p className="text-sm">
              La persona ve: <q>{review.reason}</q>
            </p>
          )}
        </section>
      )}
    </section>
  );
}

/**
 * Cada página se abre con una URL de 60 s que se pide al momento: el backend audita quién la vio.
 * No se precargan: ver un documento es una acción, no un efecto de abrir la pantalla.
 */
function PagesSection({ review }: { review: KycReviewDetail }) {
  const staff = useStaff();
  const pageUrl = useKycPageUrl(review.id);
  const [opened, setOpened] = useState<{ page: number; link: KycPageUrl } | null>(null);
  const canView = can(staff, 'kyc.review');

  return (
    <section aria-labelledby="pages" className="flex flex-col gap-2">
      <h2 id="pages" className="text-lg font-semibold">
        Páginas
      </h2>
      <p className="text-xs text-ink-soft">
        Cada vez que ves una página queda registrado en la auditoría. El enlace vence en 60
        segundos.
      </p>
      <ul className="flex flex-col gap-2">
        {review.pageFiles.map((file) => (
          <li
            key={file.page}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-3"
          >
            <span className="font-medium">
              Página {file.page}: {KYC_PURPOSE_LABELS[file.purpose] ?? file.purpose}
            </span>
            {canView && (
              <Button
                variant="secondary"
                loading={pageUrl.isPending && pageUrl.variables === file.page}
                onClick={() =>
                  pageUrl.mutate(file.page, {
                    onSuccess: (link) => setOpened({ page: file.page, link }),
                  })
                }
              >
                Ver página {file.page}
              </Button>
            )}
            {opened?.page === file.page && (
              <a
                href={opened.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand underline"
              >
                Abrir la página {file.page} en otra pestaña
              </a>
            )}
          </li>
        ))}
      </ul>
      {pageUrl.isError && <ErrorAlert error={pageUrl.error} />}
    </section>
  );
}

function DecisionControls({ review }: { review: KycReviewDetail }) {
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  return (
    <div className="flex gap-2">
      <Button variant="danger" onClick={() => setDialog('reject')}>
        Rechazar
      </Button>
      <Button onClick={() => setDialog('approve')}>Aprobar</Button>
      <ApproveDialog review={review} open={dialog === 'approve'} onClose={() => setDialog(null)} />
      <RejectDialog review={review} open={dialog === 'reject'} onClose={() => setDialog(null)} />
    </div>
  );
}

function isConflict(error: unknown): boolean {
  return error instanceof AppError && error.kind === 'conflict';
}

function fieldErrorOf(error: unknown): string | null {
  return error instanceof AppError && error.kind === 'validation' ? error.message : null;
}

function ApproveDialog({
  review,
  open,
  onClose,
}: {
  review: KycReviewDetail;
  open: boolean;
  onClose: () => void;
}) {
  const decide = useDecideKyc(review.id);
  const refresh = useRefreshKyc(review.id);
  const [income, setIncome] = useState('');
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const isIncome = review.type === 'proof_of_income' && review.monthlyIncome !== null;
  const fieldError = fieldErrorOf(decide.error);

  const close = () => {
    if (isConflict(decide.error)) void refresh();
    setIncome('');
    setIncomeError(null);
    setNote('');
    decide.reset();
    onClose();
  };

  return (
    <Dialog open={open} title="Aprobar el documento" onClose={close}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          let monthlyIncome: number | undefined;
          if (isIncome && income.trim()) {
            const parsed = parseAmount(income);
            if (parsed === null || parsed <= 0) {
              setIncomeError('Escribe un monto válido, por ejemplo 3200 o 3200.50');
              return;
            }
            monthlyIncome = parsed;
          }
          setIncomeError(null);
          decide.mutate(
            { action: 'approve', approval: { monthlyIncome, note } },
            { onSuccess: close },
          );
        }}
      >
        {isIncome && review.monthlyIncome && (
          <Field
            label="Ingreso mensual del documento (opcional)"
            error={incomeError ?? fieldError}
            hint={`Declarado: ${formatMoney(review.monthlyIncome)}. Complétalo solo si el documento dice otro monto: el límite mensual sale de este valor.`}
          >
            {(field) => (
              <input
                {...field}
                inputMode="decimal"
                className={inputClass}
                value={income}
                onChange={(event) => setIncome(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Nota interna (opcional)" hint="Solo queda en la auditoría.">
          {(field) => (
            <textarea
              {...field}
              className={inputClass}
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
        {decide.isError && !fieldError && <ErrorAlert error={decide.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" loading={decide.isPending}>
            Aprobar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RejectDialog({
  review,
  open,
  onClose,
}: {
  review: KycReviewDetail;
  open: boolean;
  onClose: () => void;
}) {
  const decide = useDecideKyc(review.id);
  const refresh = useRefreshKyc(review.id);
  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const close = () => {
    if (isConflict(decide.error)) void refresh();
    setReason('');
    setReasonError(null);
    setNote('');
    decide.reset();
    onClose();
  };

  return (
    <Dialog open={open} title="Rechazar el documento" onClose={close}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reason) {
            setReasonError('Elige el motivo del rechazo');
            return;
          }
          setReasonError(null);
          decide.mutate({ action: 'reject', rejection: { reason, note } }, { onSuccess: close });
        }}
      >
        <Field
          label="Motivo"
          error={reasonError}
          hint="La persona ve este texto en la app para corregir y reenviar."
        >
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value as RejectionReason | '')}
            >
              <option value="">Elige un motivo</option>
              {REJECTION_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {REJECTION_REASONS[code]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Nota interna (opcional)"
          hint="Solo queda en la auditoría; la persona no la ve."
        >
          {(field) => (
            <textarea
              {...field}
              className={inputClass}
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
        {decide.isError && <ErrorAlert error={decide.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={decide.isPending}>
            Rechazar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
