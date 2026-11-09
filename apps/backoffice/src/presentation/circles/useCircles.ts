import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CycleState, PauseAction } from '@/domain/circles/Circle';

import { useContainer, useStaff } from '../providers/AppProviders';

const PAGE_SIZE = 25;

export const circlesKeys = {
  all: ['circles'] as const,
  list: (state: CycleState | undefined) => ['circles', 'list', { state: state ?? 'all' }] as const,
  detail: (circleId: string) => ['circles', 'detail', circleId] as const,
};

export function useCircles(state: CycleState | undefined) {
  const { circles } = useContainer();
  return useInfiniteQuery({
    queryKey: circlesKeys.list(state),
    queryFn: ({ pageParam, signal }) =>
      circles.list.execute({ state, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useCircle(circleId: string) {
  const { circles } = useContainer();
  return useQuery({
    queryKey: circlesKeys.detail(circleId),
    queryFn: ({ signal }) => circles.get.execute(circleId, signal),
  });
}

/** Tras pausar o reanudar se recargan el detalle y los listados: cambió el estado. */
export function useSetCirclePause(circleId: string) {
  const { circles } = useContainer();
  const staff = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: PauseAction; reason: string }) =>
      circles.setPause.execute(staff, circleId, action, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: circlesKeys.all }),
  });
}
