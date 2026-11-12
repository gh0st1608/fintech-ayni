import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationTab } from '@/domain/notifications/Notification';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const notificationsQueryKey = ['notifications'] as const;
export const unreadNotificationsQueryKey = ['notifications', 'unread'] as const;

/** La bandeja por pestaña (GET /me/notifications), paginada. */
export function useNotifications(tab: NotificationTab) {
  const { notifications } = useContainer();
  return useInfiniteQuery({
    queryKey: [...notificationsQueryKey, 'list', tab],
    queryFn: ({ pageParam, signal }) =>
      notifications.list.execute({ tab, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/** No leídas para el punto de la campana; se refresca al volver a Home. */
export function useUnreadNotifications() {
  const { notifications } = useContainer();
  return useQuery({
    queryKey: unreadNotificationsQueryKey,
    queryFn: ({ signal }) => notifications.countUnread.execute(signal),
  });
}

/** Marca como leídas (o todas) y actualiza la bandeja y la campana. */
export function useMarkNotificationsRead() {
  const { notifications } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[] | null) => notifications.markRead.execute(ids),
    onSuccess: (unread) => {
      queryClient.setQueryData(unreadNotificationsQueryKey, unread);
      void queryClient.invalidateQueries({ queryKey: [...notificationsQueryKey, 'list'] });
    },
  });
}
