import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PayoutMethods, PayoutMethodType } from '@/domain/payouts/value-objects/PayoutMethod';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const payoutMethodsQueryKey = ['payouts', 'methods'] as const;

/** Catálogo de métodos de cobro con el actual (GET /me/payout-method). */
export function usePayoutMethods() {
  const { payouts } = useContainer();
  return useQuery({
    queryKey: payoutMethodsQueryKey,
    queryFn: ({ signal }) => payouts.listPayoutMethods.execute(signal),
  });
}

/** Guarda el método (PUT /me/payout-method) y deja la respuesta en la caché del catálogo. */
export function useSelectPayoutMethod() {
  const { payouts } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, catalog }: { type: PayoutMethodType; catalog: PayoutMethods }) =>
      payouts.selectPayoutMethod.execute(type, catalog),
    onSuccess: (methods) => {
      queryClient.setQueryData(payoutMethodsQueryKey, methods);
      // La elegibilidad para cobrar incluye el método (COPAYNI-36).
      void queryClient.invalidateQueries({ queryKey: ['payments', 'eligibility'] });
    },
  });
}
