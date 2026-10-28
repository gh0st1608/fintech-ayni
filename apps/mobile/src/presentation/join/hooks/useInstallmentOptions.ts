import { useQuery } from '@tanstack/react-query';

import type { Money } from '@/domain/shared/value-objects/Money';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Cuotas × meses para el payout elegido (GET /circles/installment-options). */
export function useInstallmentOptions(payout: Money | null) {
  const { circles } = useContainer();
  return useQuery({
    queryKey: ['circles', 'quote', 'installments', payout?.amount, payout?.currency],
    // Sin payout la query está deshabilitada: queryFn solo corre con un monto.
    queryFn: ({ signal }) => circles.listInstallmentOptions.execute(payout!, signal),
    enabled: payout !== null,
  });
}
