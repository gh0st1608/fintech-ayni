import { Link, useSearchParams } from 'react-router';

import {
  FUND_MOVEMENT_LABELS,
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUSES,
  type InstallmentStatus,
  isPeriod,
} from '@/domain/finance/Finance';
import { can } from '@/domain/staff/Staff';

import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime, formatDay, formatMoney, formatPeriod } from '../format';
import { useStaff } from '../providers/AppProviders';
import { useGuaranteeFund, useInstallments, usePayouts } from './useFinance';

const VIEWS = {
  installments: 'Cuotas',
  payouts: 'Pozos entregados',
  fund: 'Fondo de garantía',
} as const;
type View = keyof typeof VIEWS;

const isView = (value: string | null): value is View => value !== null && value in VIEWS;
const isStatus = (value: string | null): value is InstallmentStatus =>
  (INSTALLMENT_STATUSES as readonly string[]).includes(value ?? '');

const STATUS_TONE: Record<InstallmentStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  paid: 'success',
  overdue: 'warning',
  defaulted: 'danger',
  retained: 'neutral',
  deducted: 'neutral',
};

/**
 * Finanzas (docs/backoffice-plan.md, fase 3), solo lectura: cuotas, pozos entregados y el fondo de
 * garantía. Registrar movimientos espera la doble aprobación (BO6). La vista y los filtros viven
 * en la URL.
 */
export function FinanceScreen() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view: View = isView(rawView) ? rawView : 'installments';

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Finanzas</h1>
        <p className="text-sm text-ink-soft">
          Solo lectura. Los movimientos manuales llegan con la doble aprobación.
        </p>
        <nav aria-label="Vistas de finanzas" className="flex flex-wrap gap-1">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setParams(key === 'installments' ? {} : { view: key })}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                view === key ? 'bg-muted text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {VIEWS[key]}
            </button>
          ))}
        </nav>
      </header>
      {view === 'installments' && <InstallmentsView />}
      {view === 'payouts' && <PayoutsView />}
      {view === 'fund' && <FundView />}
    </section>
  );
}

function CircleLink({ circleId, children }: { circleId: string; children: React.ReactNode }) {
  const staff = useStaff();
  if (!can(staff, 'circles.read')) return <>{children}</>;
  return (
    <Link to={`/circles/${circleId}`} className="text-brand underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

function InstallmentsView() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const rawPeriod = params.get('period');
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const period = rawPeriod && isPeriod(rawPeriod) ? rawPeriod : undefined;
  const installments = useInstallments(status, period);
  const pages = installments.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const totals = pages[0]?.totals ?? [];

  const setFilter = (key: 'status' | 'period', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <div className="w-full sm:w-56">
          <Field label="Estado">
            {(field) => (
              <select
                {...field}
                className={inputClass}
                value={status ?? ''}
                onChange={(event) => setFilter('status', event.target.value)}
              >
                <option value="">Todos</option>
                {INSTALLMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {INSTALLMENT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="w-full sm:w-48">
          <Field label="Mes">
            {(field) => (
              <input
                {...field}
                type="month"
                className={inputClass}
                value={period ?? ''}
                onChange={(event) => setFilter('period', event.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      {totals.length > 0 && (
        <ul aria-label="Totales por estado" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {totals.map((total) => (
            <li
              key={`${total.status}-${total.total.currency}`}
              className="rounded-md border border-line bg-surface p-3"
            >
              <p className="text-xs text-ink-soft">{INSTALLMENT_STATUS_LABELS[total.status]}</p>
              <p className="font-semibold">{formatMoney(total.total)}</p>
              <p className="text-xs text-ink-soft">
                {total.count} {total.count === 1 ? 'cuota' : 'cuotas'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {installments.isPending && <Spinner label="Cargando cuotas" />}
      {installments.isError && items.length === 0 && (
        <ErrorAlert error={installments.error} onRetry={() => void installments.refetch()} />
      )}
      {installments.isSuccess && items.length === 0 && (
        <EmptyState title="No hay cuotas con estos filtros" />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <caption className="sr-only">Cuotas</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Vence
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Persona
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Junta y turno
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Monto
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">{formatDay(item.dueOn)}</td>
                  <td className="px-4 py-2">{item.member.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <CircleLink circleId={item.circleId}>
                      {formatPeriod(item.period)} · turno {item.position}
                    </CircleLink>
                  </td>
                  <td className="px-4 py-2">{formatMoney(item.amount)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[item.status]}>
                      {INSTALLMENT_STATUS_LABELS[item.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {installments.isError && items.length > 0 && (
        <ErrorAlert error={installments.error} onRetry={() => void installments.fetchNextPage()} />
      )}
      {installments.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={installments.isFetchingNextPage}
            onClick={() => void installments.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}

function PayoutsView() {
  const payouts = usePayouts();
  const items = payouts.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      {payouts.isPending && <Spinner label="Cargando pozos" />}
      {payouts.isError && items.length === 0 && (
        <ErrorAlert error={payouts.error} onRetry={() => void payouts.refetch()} />
      )}
      {payouts.isSuccess && items.length === 0 && (
        <EmptyState title="Todavía no se entregó ningún pozo" />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <caption className="sr-only">Pozos entregados</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Entregado
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Persona
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Junta y turno
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">{formatDateTime(item.disbursedAt)}</td>
                  <td className="px-4 py-2">{item.member.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <CircleLink circleId={item.circleId}>
                      {formatPeriod(item.period)} · turno {item.position}
                    </CircleLink>
                  </td>
                  <td className="px-4 py-2">{formatMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payouts.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={payouts.isFetchingNextPage}
            onClick={() => void payouts.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}

function FundView() {
  const fund = useGuaranteeFund();
  const pages = fund.data?.pages ?? [];
  const balances = pages[0]?.balances ?? [];
  const items = pages.flatMap((page) => page.items);

  if (fund.isPending) return <Spinner label="Cargando el fondo" />;
  if (fund.isError && items.length === 0 && balances.length === 0) {
    return <ErrorAlert error={fund.error} onRetry={() => void fund.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {balances.length === 0 ? (
        <EmptyState title="El fondo todavía no tiene saldo ni juntas en curso" />
      ) : (
        <ul aria-label="Saldo del fondo" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {balances.map((balance) => (
            <li
              key={balance.balance.currency}
              className={`flex flex-col gap-1 rounded-md border p-4 ${
                balance.belowMinimum ? 'border-danger/50 bg-danger/5' : 'border-line bg-surface'
              }`}
            >
              <p className="text-xs text-ink-soft">Saldo ({balance.balance.currency})</p>
              <p className="text-xl font-semibold">{formatMoney(balance.balance)}</p>
              <p className="text-sm">
                Mínimo esperado {formatMoney(balance.minimum)} para {balance.activeCircles}{' '}
                {balance.activeCircles === 1 ? 'junta en curso' : 'juntas en curso'}.
              </p>
              {balance.belowMinimum && (
                <p role="alert" className="text-sm font-medium text-danger">
                  Por debajo del mínimo
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-semibold">Movimientos</h2>
      {items.length === 0 ? (
        <EmptyState title="Sin movimientos" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <caption className="sr-only">Movimientos del fondo</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Movimiento
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Junta
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {items.map((item) => (
                <tr
                  key={`${item.transactionKey}-${item.amount.currency}-${String(item.amount.amount)}`}
                >
                  <td className="px-4 py-2">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-2">
                    {FUND_MOVEMENT_LABELS[item.kind] ?? item.kind}
                    {item.reason && (
                      <span className="block text-xs text-ink-soft">{item.reason}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {item.circleId ? (
                      <CircleLink circleId={item.circleId}>
                        {item.period ? formatPeriod(item.period) : 'Ver junta'}
                      </CircleLink>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 font-medium ${item.amount.amount < 0 ? 'text-danger' : 'text-success'}`}
                  >
                    {formatMoney(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fund.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={fund.isFetchingNextPage}
            onClick={() => void fund.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
