import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { TransactionType } from '@/domain/payments/Transaction';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const paymentSummaryQueryKey = ['payments', 'summary'] as const;
export const transactionsQueryKey = (type: TransactionType) =>
  ['payments', 'transactions', type] as const;

/** Resumen de la pestaña Payment (GET /me/payments/summary). */
export function usePaymentSummary() {
  const { payments } = useContainer();
  return useQuery({
    queryKey: paymentSummaryQueryKey,
    queryFn: ({ signal }) => payments.getSummary.execute(signal),
  });
}

/** Historial de pagos o cobros, página a página (GET /me/transactions). */
export function useTransactions(type: TransactionType) {
  const { payments } = useContainer();
  return useInfiniteQuery({
    queryKey: transactionsQueryKey(type),
    queryFn: ({ pageParam, signal }) => payments.listTransactions.execute(type, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}
