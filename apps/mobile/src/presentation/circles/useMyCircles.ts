import { useInfiniteQuery } from '@tanstack/react-query';

import type { MyCircleStatus } from '@/domain/circles/MyCircle';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const myCirclesQueryKey = (status: MyCircleStatus) => ['circles', 'mine', status] as const;

/** Mis círculos por estado, página a página (GET /me/circles). */
export function useMyCircles(status: MyCircleStatus) {
  const { circles } = useContainer();
  return useInfiniteQuery({
    queryKey: myCirclesQueryKey(status),
    queryFn: ({ pageParam, signal }) => circles.listMyCircles.execute(status, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}
