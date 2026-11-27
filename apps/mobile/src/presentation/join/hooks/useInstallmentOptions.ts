import { useQuery } from '@tanstack/react-query';

import type { Cadence } from '@/domain/circles/MyCircleDetail';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/**
 * Cuotas × turnos para el payout y la frecuencia elegidos (GET /circles/installment-options).
 *
 * La cadencia entra en la clave: cambiarla recalcula las opciones, porque la duración de cada
 * combinación depende de ella (COPAYNI-116).
 */
export function useInstallmentOptions(payout: Money | null, cadence: Cadence = 'monthly') {
  const { circles } = useContainer();
  return useQuery({
    queryKey: ['circles', 'quote', 'installments', payout?.amount, payout?.currency, cadence],
    // Sin payout la query está deshabilitada: queryFn solo corre con un monto.
    queryFn: ({ signal }) => circles.listInstallmentOptions.execute(payout!, cadence, signal),
    enabled: payout !== null,
  });
}
