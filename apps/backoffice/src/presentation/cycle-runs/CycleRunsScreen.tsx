import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { Badge, Button, EmptyState, ErrorAlert, Spinner } from '../components/ui';
import { formatDateTime, formatDay } from '../format';
import { useContainer } from '../providers/AppProviders';

const PAGE_SIZE = 25;

function useCycleRuns() {
  const { cycleRuns } = useContainer();
  return useInfiniteQuery({
    queryKey: ['cycle-runs'],
    queryFn: ({ pageParam, signal }) =>
      cycleRuns.list.execute({ cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/**
 * Ejecuciones de la tarea diaria del ciclo mensual (docs/backoffice-plan.md, fase 2): cuántas
 * juntas avanzaron y cuáles fallaron, para revisarlas sin entrar a los logs.
 */
export function CycleRunsScreen() {
  const runs = useCycleRuns();
  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Ciclo mensual</h1>
        <p className="text-sm text-ink-soft">
          Cada ejecución de la tarea diaria: juntas que avanzaron, bloqueadas por otra ejecución y
          las que fallaron.
        </p>
      </header>

      {runs.isPending && <Spinner label="Cargando ejecuciones" />}
      {runs.isError && items.length === 0 && (
        <ErrorAlert error={runs.error} onRetry={() => void runs.refetch()} />
      )}
      {runs.isSuccess && items.length === 0 && (
        <EmptyState
          title="La tarea diaria todavía no corrió"
          description="En prd está apagada hasta que exista el cobro real."
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((run) => (
            <li key={run.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {formatDay(run.businessDate)}
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {formatDateTime(run.startedAt)}
                  </span>
                </p>
                <Badge tone={run.failed > 0 ? 'danger' : 'success'}>
                  {run.failed > 0 ? `${String(run.failed)} con error` : 'Sin errores'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                Avanzaron {run.advanced} · Bloqueadas {run.locked}
              </p>
              {run.failures.length > 0 && (
                <ul aria-label="Juntas con error" className="mt-2 flex flex-col gap-1 text-sm">
                  {run.failures.map((failure) => (
                    <li key={failure.circleId}>
                      <Link
                        to={`/circles/${failure.circleId}`}
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        Ver junta
                      </Link>
                      <span className="ml-2 text-ink-soft">{failure.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {runs.isError && items.length > 0 && (
        <ErrorAlert error={runs.error} onRetry={() => void runs.fetchNextPage()} />
      )}
      {runs.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            loading={runs.isFetchingNextPage}
            onClick={() => void runs.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      )}
    </section>
  );
}
