import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/presentation/providers/ContainerProvider';

export const JOIN_CONFIG_QUERY_KEY = ['join', 'config'] as const;

/** Montos permitidos para unirse (GET /circles/join-config). */
export function useJoinConfig() {
  const { circles } = useContainer();
  return useQuery({
    queryKey: JOIN_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) => circles.getJoinConfig.execute(signal),
  });
}
