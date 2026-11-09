import { Link, useSearchParams } from 'react-router';

import { CYCLE_STATES, type CycleState, fillRatio } from '@/domain/circles/Circle';

import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatMoney, formatPeriod, STATE_LABELS } from '../format';
import { useCircles } from './useCircles';

const isState = (value: string | null): value is CycleState =>
  (CYCLE_STATES as readonly string[]).includes(value ?? '');

/** Juntas por estado (docs/backoffice-plan.md, fase 2). El filtro vive en la URL. */
export function CirclesScreen() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('state');
  const state = isState(raw) ? raw : undefined;
  const circles = useCircles(state);
  const items = circles.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Juntas</h1>
        <div className="w-full sm:w-64">
          <Field label="Estado">
            {(field) => (
              <select
                {...field}
                className={inputClass}
                value={state ?? ''}
                onChange={(event) => {
                  const next = event.target.value;
                  setParams(next ? { state: next } : {});
                }}
              >
                <option value="">Todos</option>
                {CYCLE_STATES.map((value) => (
                  <option key={value} value={value}>
                    {STATE_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </header>

      {circles.isPending && <Spinner label="Cargando juntas" />}
      {circles.isError && items.length === 0 && (
        <ErrorAlert error={circles.error} onRetry={() => void circles.refetch()} />
      )}
      {circles.isSuccess && items.length === 0 && (
        <EmptyState
          title="No hay juntas en este estado"
          description="Prueba con otro filtro o con Todos."
        />
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <caption className="sr-only">Juntas</caption>
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Pozo
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Inicio
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Turnos ocupados
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {items.map((circle) => (
                <tr key={circle.circleId}>
                  <td className="px-4 py-2">
                    <Link
                      to={`/circles/${circle.circleId}`}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {formatMoney(circle.payout)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={circle.state === 'paused' ? 'warning' : 'neutral'}>
                      {STATE_LABELS[circle.state]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">{formatPeriod(circle.startsOn)}</td>
                  <td className="px-4 py-2">
                    {circle.members} de {circle.months} ({Math.round(fillRatio(circle) * 100)} %)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {circles.isError && items.length > 0 && (
        <ErrorAlert error={circles.error} onRetry={() => void circles.fetchNextPage()} />
      )}
      {circles.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={circles.isFetchingNextPage}
            onClick={() => void circles.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </section>
  );
}
