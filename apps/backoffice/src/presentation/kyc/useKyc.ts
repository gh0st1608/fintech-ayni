import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { KycApproval, KycRejection, KycStatus, KycType } from '@/domain/kyc/Kyc';

import { useContainer, useStaff } from '../providers/AppProviders';

const PAGE_SIZE = 25;

export const kycKeys = {
  all: ['kyc'] as const,
  lists: ['kyc', 'list'] as const,
  list: (status: KycStatus, type: KycType | undefined) =>
    ['kyc', 'list', { status, type: type ?? 'all' }] as const,
  detail: (id: string) => ['kyc', 'detail', id] as const,
};

export function useKycReviews(status: KycStatus, type: KycType | undefined) {
  const { kyc } = useContainer();
  return useInfiniteQuery({
    queryKey: kycKeys.list(status, type),
    queryFn: ({ pageParam, signal }) =>
      kyc.list.execute({ status, type, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useKycReview(id: string) {
  const { kyc } = useContainer();
  return useQuery({
    queryKey: kycKeys.detail(id),
    queryFn: ({ signal }) => kyc.get.execute(id, signal),
  });
}

/** La URL dura 60 s: no se guarda en caché, se pide cada vez que alguien quiere ver la página. */
export function useKycPageUrl(id: string) {
  const { kyc } = useContainer();
  const staff = useStaff();
  return useMutation({
    mutationFn: (page: number) => kyc.pageUrl.execute(staff, id, page),
  });
}

export type KycDecision =
  { action: 'approve'; approval: KycApproval } | { action: 'reject'; rejection: KycRejection };

/** Tras resolver se recargan la cola y el detalle: el documento salió de "En revisión". */
export function useDecideKyc(id: string) {
  const { kyc } = useContainer();
  const staff = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: KycDecision) =>
      decision.action === 'approve'
        ? kyc.approve.execute(staff, id, decision.approval)
        : kyc.reject.execute(staff, id, decision.rejection),
    onSuccess: (review) => {
      queryClient.setQueryData(kycKeys.detail(id), review);
      return queryClient.invalidateQueries({ queryKey: kycKeys.lists });
    },
  });
}

/**
 * Recarga el documento y la cola. Se usa al cerrar el diálogo tras un 409 (otra persona lo resolvió
 * antes): recargar en el momento del error desmontaría el diálogo antes de leer el aviso.
 */
export function useRefreshKyc(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: kycKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: kycKeys.lists }),
    ]);
}
