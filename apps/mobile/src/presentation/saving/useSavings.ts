import { useQueries, useQuery } from '@tanstack/react-query';

import { useContainer } from '@/presentation/providers/ContainerProvider';

export const savingPlansQueryKey = ['savings', 'plans'] as const;
export const savingQuoteQueryKey = (planId: string, months: number) =>
  ['savings', 'quote', planId, months] as const;

/** Catálogo de Choose a Saving Circle (GET /savings/plans). */
export function useSavingPlans() {
  const { savings } = useContainer();
  return useQuery({
    queryKey: savingPlansQueryKey,
    queryFn: ({ signal }) => savings.listPlans.execute(signal),
  });
}

/** Una cotización por duración ofrecida, para mostrar la cuota de cada opción. */
export function useSavingQuotes(planId: string | null, durations: number[]) {
  const { savings } = useContainer();
  return useQueries({
    queries: durations.map((months) => ({
      queryKey: savingQuoteQueryKey(planId ?? '', months),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        savings.getQuote.execute(planId!, months, signal),
      enabled: planId !== null,
    })),
  });
}
