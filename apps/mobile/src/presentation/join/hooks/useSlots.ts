import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useContainer } from '@/presentation/providers/ContainerProvider';

const slotsQueryKey = (payout: Money | null, installment: InstallmentOption | null) =>
  ['circles', 'quote', 'slots', payout?.amount, payout?.currency, installment?.months] as const;

/** Slots agrupados por tipo de turno (GET /circles/slots). */
export function useAvailableSlots(payout: Money | null, installment: InstallmentOption | null) {
  const { circles } = useContainer();
  return useQuery({
    queryKey: slotsQueryKey(payout, installment),
    // Sin los pasos anteriores la query está deshabilitada: queryFn solo corre con ambos.
    queryFn: ({ signal }) => circles.listAvailableSlots.execute(payout!, installment!, signal),
    enabled: payout !== null && installment !== null,
  });
}

/** Revalida el slot elegido antes de continuar; si se ocupó, refresca la lista. */
export function useConfirmSlot(payout: Money | null, installment: InstallmentOption | null) {
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (position: number) =>
      circles.confirmSlotSelection.execute(payout!, installment!, position),
    onError: () => queryClient.invalidateQueries({ queryKey: slotsQueryKey(payout, installment) }),
  });
}
