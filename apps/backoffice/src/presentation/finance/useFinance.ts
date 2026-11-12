import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApprovalStatus, FundMovementKind } from '@/domain/finance/Approval';
import type { InstallmentStatus } from '@/domain/finance/Finance';

import { useContainer, useStaff } from '../providers/AppProviders';

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

export function useApprovals(status: ApprovalStatus | undefined) {
  const { finance } = useContainer();
  return useInfiniteQuery({
    queryKey: ['finance', 'approvals', status ?? 'all'],
    queryFn: ({ pageParam, signal }) =>
      finance.approvals.execute({ status, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/** Tras proponer o decidir se recargan las propuestas y el fondo (un aprobado lo mueve). */
function useRefreshFinance() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['finance', 'guarantee-fund'] }),
    ]);
}

export function useProposeMovement() {
  const { finance } = useContainer();
  const staff = useStaff();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (input: {
      kind: FundMovementKind;
      amount: string;
      currency: string;
      reason: string;
    }) => finance.proposeMovement.execute(staff, input),
    onSuccess: refresh,
  });
}

export function useDecideApproval(approvalId: string) {
  const { finance } = useContainer();
  const staff = useStaff();
  const refresh = useRefreshFinance();
  return useMutation({
    mutationFn: (decision: { action: 'approve' } | { action: 'reject'; reason: string }) =>
      finance.decide.execute(staff, approvalId, decision),
    onSuccess: refresh,
  });
}
