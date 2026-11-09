import { useInfiniteQuery } from '@tanstack/react-query';

import type { InstallmentStatus } from '@/domain/finance/Finance';

import { useContainer } from '../providers/AppProviders';

const PAGE_SIZE = 25;

export function useInstallments(status: InstallmentStatus | undefined, period: string | undefined) {
  const { finance } = useContainer();
  return useInfiniteQuery({
    queryKey: ['finance', 'installments', { status: status ?? 'all', period: period ?? 'all' }],
    queryFn: ({ pageParam, signal }) =>
      finance.installments.execute({ status, period, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function usePayouts() {
  const { finance } = useContainer();
  return useInfiniteQuery({
    queryKey: ['finance', 'payouts'],
    queryFn: ({ pageParam, signal }) =>
      finance.payouts.execute({ cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useGuaranteeFund() {
  const { finance } = useContainer();
  return useInfiniteQuery({
    queryKey: ['finance', 'guarantee-fund'],
    queryFn: ({ pageParam, signal }) =>
      finance.guaranteeFund.execute({ cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}
