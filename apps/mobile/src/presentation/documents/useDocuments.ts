import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { IncomeProofKind } from '@/domain/documents/KycDocument';
import type { LocalFile } from '@/domain/documents/LocalFile';
import type { Money } from '@/domain/shared/value-objects/Money';
import { payoutEligibilityQueryKey } from '@/presentation/payment/usePayments';
import { profileQueryKey } from '@/presentation/profile/useProfile';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const documentsQueryKey = ['documents'] as const;

/** Mis documentos (GET /me/documents). */
export function useDocuments() {
  const { documents } = useContainer();
  return useQuery({
    queryKey: documentsQueryKey,
    queryFn: ({ signal }) => documents.list.execute(signal),
  });
}

/** Un documento aprobado cambia la elegibilidad y el límite mensual: se refrescan. */
function useRefreshAfterSubmit() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    void queryClient.invalidateQueries({ queryKey: payoutEligibilityQueryKey });
    void queryClient.invalidateQueries({ queryKey: profileQueryKey });
  };
}

export function useSubmitNationalId() {
  const { documents } = useContainer();
  const refresh = useRefreshAfterSubmit();
  return useMutation({
    mutationFn: ({ front, back }: { front: LocalFile; back: LocalFile }) =>
      documents.submitNationalId.execute(front, back),
    onSuccess: refresh,
  });
}

export function useSubmitProofOfIncome() {
  const { documents } = useContainer();
  const refresh = useRefreshAfterSubmit();
  return useMutation({
    mutationFn: ({
      kind,
      monthlyIncome,
      pages,
    }: {
      kind: IncomeProofKind;
      monthlyIncome: Money;
      pages: LocalFile[];
    }) => documents.submitProofOfIncome.execute(kind, monthlyIncome, pages),
    onSuccess: refresh,
  });
}
