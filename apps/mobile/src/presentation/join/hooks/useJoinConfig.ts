import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useContainer } from '@/presentation/providers/ContainerProvider';

export const JOIN_CONFIG_QUERY_KEY = ['join', 'config'] as const;

/**
 * Montos permitidos para unirse (GET /circles/join-config), en `currency` o en la moneda
 * oficial. Al cambiar de moneda se sigue mostrando la anterior hasta que llega la nueva.
 */
export function useJoinConfig(currency?: string) {
  const { circles } = useContainer();
  return useQuery({
    queryKey: [...JOIN_CONFIG_QUERY_KEY, currency ?? 'official'],
    queryFn: ({ signal }) => circles.getJoinConfig.execute(signal, currency),
    placeholderData: keepPreviousData,
  });
}
