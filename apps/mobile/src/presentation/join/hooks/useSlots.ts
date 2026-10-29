import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useContainer } from '@/presentation/providers/ContainerProvider';

const slotsQueryKey = (
  payout: Money | null,
  installment: InstallmentOption | null,
  circleId: string | null,
) =>
  [
    'circles',
    'quote',
    'slots',
    payout?.amount,
    payout?.currency,
    installment?.months,
    circleId,
  ] as const;

/**
 * Slots agrupados por tipo de turno (GET /circles/slots). `circleId`: el círculo recomendado
 * elegido en Home, p. ej. una vacante (COPAYNI-59).
 */
export function useAvailableSlots(
  payout: Money | null,
  installment: InstallmentOption | null,
  circleId: string | null = null,
) {
  const { circles } = useContainer();
  return useQuery({
    queryKey: slotsQueryKey(payout, installment, circleId),
    // Sin los pasos anteriores la query está deshabilitada: queryFn solo corre con ambos.
    queryFn: ({ signal }) =>
      circles.listAvailableSlots.execute(payout!, installment!, signal, circleId),
    enabled: payout !== null && installment !== null,
  });
}

/** Revalida el slot elegido antes de continuar; si se ocupó, refresca la lista. */
export function useConfirmSlot(
  payout: Money | null,
  installment: InstallmentOption | null,
  circleId: string | null = null,
) {
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (position: number) =>
      circles.confirmSlotSelection.execute(payout!, installment!, position, undefined, circleId),
    onError: () =>
      queryClient.invalidateQueries({ queryKey: slotsQueryKey(payout, installment, circleId) }),
  });
}
