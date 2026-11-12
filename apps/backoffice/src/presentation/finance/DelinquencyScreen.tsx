import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import {
  DELINQUENCY_VIEW_LABELS,
  DELINQUENCY_VIEWS,
  type DelinquencyItem,
  type DelinquencyView,
} from '@/domain/finance/Delinquency';
import { can } from '@/domain/staff/Staff';

import { Badge, Button, EmptyState, ErrorAlert, Spinner } from '../components/ui';
import { formatDateTime, formatDay, formatMoney, formatPeriod } from '../format';
import { useContainer, useStaff } from '../providers/AppProviders';

const isView = (value: string | null): value is DelinquencyView =>
  (DELINQUENCY_VIEWS as readonly string[]).includes(value ?? '');

const DATE_LABEL: Record<DelinquencyView, string> = {
  grace: 'Venció',
  expelled: 'Expulsión',
  debts: 'Expulsión',
  refunds: 'Expulsión',
};
const AMOUNT_LABEL: Record<DelinquencyView, string> = {
  grace: 'Cuota',
  expelled: 'Vencido',
  debts: 'Vencido',
  refunds: 'A devolver',
};

function useDelinquency(view: DelinquencyView) {
  const { finance } = useContainer();
  return useInfiniteQuery({
    queryKey: ['finance', 'delinquency', view],
    queryFn: ({ pageParam, signal }) =>
      finance.delinquency.execute({ view, cursor: pageParam, limit: 25 }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/**
 * Mora (COPAYNI-94, fase 3 del back-office), solo lectura: quién está en gracia, los expulsados,
 * sus deudas con cargo por mora y las devoluciones pendientes. La vista vive en la URL.
 */
export function DelinquencyScreen() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: DelinquencyView = isView(raw) ? raw : 'grace';
  const delinquency = useDelinquency(view);
  const pages = delinquency.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const pending = pages[0]?.pending ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Mora</h1>
        <p className="text-sm text-ink-soft">
          Solo lectura. Los nombres van enmascarados; el detalle está en la ficha de la persona.
        </p>
        <nav aria-label="Vistas de mora" className="flex flex-wrap gap-1">
          {DELINQUENCY_VIEWS.map((key) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setParams(key === 'grace' ? {} : { view: key })}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                view === key ? 'bg-muted text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {DELINQUENCY_VIEW_LABELS[key]}
            </button>
          ))}
        </nav>
      </header>
      {pending.length > 0 && (
        <ul aria-label="Pendiente" className="flex flex-wrap gap-2">
          {pending.map((money) => (
            <li key={money.currency} className="rounded-md border border-line bg-surface p-3">
              <p className="text-xs text-ink-soft">Pendiente ({money.currency})</p>
              <p className="text-lg font-semibold">{formatMoney(money)}</p>
            </li>
          ))}
        </ul>
      )}
      {delinquency.isPending && <Spinner label="Cargando la mora" />}
      {delinquency.isError && items.length === 0 && (
        <ErrorAlert error={delinquency.error} onRetry={() => void delinquency.refetch()} />
      )}
      {delinquency.isSuccess && items.length === 0 && (
        <EmptyState title="No hay nadie en esta vista" />
      )}
      {items.length > 0 && <DelinquencyTable view={view} items={items} />}
      {delinquency.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={delinquency.isFetchingNextPage}
            onClick={() => void delinquency.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </section>
  );
}

function DelinquencyTable({ view, items }: { view: DelinquencyView; items: DelinquencyItem[] }) {
  const staff = useStaff();
  const canSeePeople = can(staff, 'users.read');
  const canSeeCircles = can(staff, 'circles.read');
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="min-w-full divide-y divide-line text-sm">
        <caption className="sr-only">{DELINQUENCY_VIEW_LABELS[view]}</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Persona
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Mes
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {DATE_LABEL[view]}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {AMOUNT_LABEL[view]}
            </th>
            {view !== 'grace' && view !== 'refunds' && (
              <th scope="col" className="px-4 py-2 font-medium">
                Cargo por mora
              </th>
            )}
            <th scope="col" className="px-4 py-2 font-medium">
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-2">
                {canSeePeople ? (
                  <Link
                    to={`/users/${item.member.userId}`}
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    {item.member.name ?? 'Sin nombre'}
                  </Link>
                ) : (
                  (item.member.name ?? 'Sin nombre')
                )}
              </td>
              <td className="px-4 py-2">
                {canSeeCircles ? (
                  <Link
                    to={`/circles/${item.circleId}`}
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    {formatPeriod(item.period)}
                  </Link>
                ) : (
                  formatPeriod(item.period)
                )}
              </td>
              <td className="px-4 py-2">{formatDay(item.date)}</td>
              <td className="px-4 py-2">{formatMoney(item.amount)}</td>
              {view !== 'grace' && view !== 'refunds' && (
                <td className="px-4 py-2">{item.lateFee ? formatMoney(item.lateFee) : '—'}</td>
              )}
              <td className="px-4 py-2">
                {view === 'grace' ? (
                  <Badge tone="warning">
                    Gracia hasta {item.graceEndsOn ? formatDay(item.graceEndsOn) : '—'}
                  </Badge>
                ) : item.settledAt ? (
                  <Badge tone="success">
                    {view === 'refunds' ? 'Devuelto' : 'Saldada'} el{' '}
                    {formatDateTime(item.settledAt)}
                  </Badge>
                ) : (
                  <Badge tone="danger">Pendiente</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
