import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  NotificationPreferences,
  NotificationPreferencesPatch,
} from '@/domain/notifications/PushRegistration';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const pushPreferencesQueryKey = ['notifications', 'preferences'] as const;
export const pushPermissionQueryKey = ['notifications', 'permission'] as const;

/** Qué avisos quiere recibir la persona (GET /me/notification-preferences). */
export function useNotificationPreferences() {
  const { push } = useContainer();
  return useQuery({
    queryKey: pushPreferencesQueryKey,
    queryFn: ({ signal }) => push.preferences.execute(signal),
  });
}

/** El permiso del sistema operativo, para explicar por qué no llegan avisos. */
export function usePushPermission() {
  const { push } = useContainer();
  return useQuery({
    queryKey: pushPermissionQueryKey,
    queryFn: () => push.permission.execute(),
  });
}

/**
 * Cambia una preferencia. Pinta el cambio al instante y lo deshace si el backend lo rechaza: un
 * interruptor que se queda a medias no se entiende.
 */
export function useSaveNotificationPreferences() {
  const { push } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) => push.savePreferences.execute(patch),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<NotificationPreferences>(pushPreferencesQueryKey);
      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(pushPreferencesQueryKey, {
          pushEnabled: patch.pushEnabled ?? previous.pushEnabled,
          categories: { ...previous.categories, ...patch.categories },
        });
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(pushPreferencesQueryKey, context.previous);
      }
    },
    onSuccess: (updated) => queryClient.setQueryData(pushPreferencesQueryKey, updated),
  });
}

/**
 * Pide el permiso y registra el celular. Solo se llama cuando la persona lo pide desde los
 * ajustes: el arranque de la app no pregunta (ver `RegisterPushDeviceUseCase`).
 */
export function useEnablePush() {
  const { push } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => push.register.execute({ ask: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pushPermissionQueryKey }),
  });
}
