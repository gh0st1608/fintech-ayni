import { useQuery } from '@tanstack/react-query';

import { useContainer } from '@/presentation/providers/ContainerProvider';

export const recommendedCirclesQueryKey = ['circles', 'recommended'] as const;

/** Círculos recomendados (GET /circles/recommended). */
export function useRecommendedCircles() {
  const { circles } = useContainer();
  return useQuery({
    queryKey: recommendedCirclesQueryKey,
    queryFn: ({ signal }) => circles.listRecommended.execute(signal),
  });
}
