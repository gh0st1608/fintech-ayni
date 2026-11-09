import { Link, useSearchParams } from 'react-router';

import {
  KYC_KIND_LABELS,
  KYC_STATUS_LABELS,
  KYC_STATUSES,
  KYC_TYPE_LABELS,
  KYC_TYPES,
  type KycStatus,
  type KycType,
} from '@/domain/kyc/Kyc';

import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime, formatMoney } from '../format';
import { useKycReviews } from './useKyc';

const isStatus = (value: string | null): value is KycStatus =>
  (KYC_STATUSES as readonly string[]).includes(value ?? '');
const isType = (value: string | null): value is KycType =>
  (KYC_TYPES as readonly string[]).includes(value ?? '');

/**
 * Cola de revisión manual del KYC (docs/backoffice-plan.md, fase 2). En revisión va la más antigua
 * primero, porque es la que más espera. Los filtros viven en la URL.
 */
export function KycQueueScreen() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const rawType = params.get('type');
  const status = isStatus(rawStatus) ? rawStatus : 'in_review';
  const type = isType(rawType) ? rawType : undefined;
  const reviews = useKycReviews(status, type);
  const items = reviews.data?.pages.flatMap((page) => page.items) ?? [];
  const pending = status === 'in_review';

  const setFilter = (key: 'status' | 'type', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Revisión de documentos</h1>
          <p className="text-sm text-ink-soft">
            {pending
              ? 'Del más antiguo al más nuevo: empieza por el primero.'
              : 'Del más reciente al más antiguo.'}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-4 sm:w-auto">
          <div className="w-full sm:w-48">
            <Field label="Estado">
              {(field) => (
                <select
                  {...field}
                  className={inputClass}
                  value={status}
                  onChange={(event) => {
                    const value = event.target.value;
                    setFilter('status', value === 'in_review' ? '' : value);
                  }}
                >
                  {KYC_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {KYC_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div className="w-full sm:w-56">
            <Field label="Tipo">
              {(field) => (
                <select
                  {...field}
                  className={inputClass}
                  value={type ?? ''}
                  onChange={(event) => setFilter('type', event.target.value)}
                >
                  <option value="">Todos</option>
                  {KYC_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {KYC_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>
      </header>

      {reviews.isPending && <Spinner label="Cargando documentos" />}
      {reviews.isError && items.length === 0 && (
        <ErrorAlert error={reviews.error} onRetry={() => void reviews.refetch()} />
      )}
      {reviews.isSuccess && items.length === 0 && (
        <EmptyState
          title={pending ? 'No hay documentos por revisar' : 'No hay documentos'}
          description={pending ? 'La cola está al día.' : 'Prueba con otro filtro.'}
        />
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <caption className="sr-only">Documentos</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Documento
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Persona
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Ingreso declarado
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Enviado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {items.map((review) => (
                <tr key={review.id}>
                  <td className="px-4 py-2">
                    <Link
                      to={`/kyc/${review.id}`}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {KYC_TYPE_LABELS[review.type]}
                    </Link>
                    <span className="ml-2 text-ink-soft">
                      {KYC_KIND_LABELS[review.kind] ?? review.kind} · {review.pages}{' '}
                      {review.pages === 1 ? 'página' : 'páginas'}
                    </span>
                    {review.superseded && (
                      <span className="ml-2">
                        <Badge tone="warning">Hay uno más nuevo</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {review.subject.name ?? review.subject.email ?? review.subject.phone ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {review.monthlyIncome ? formatMoney(review.monthlyIncome) : '—'}
                  </td>
                  <td className="px-4 py-2">{formatDateTime(review.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviews.isError && items.length > 0 && (
        <ErrorAlert error={reviews.error} onRetry={() => void reviews.fetchNextPage()} />
      )}
      {reviews.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={reviews.isFetchingNextPage}
            onClick={() => void reviews.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </section>
  );
}
