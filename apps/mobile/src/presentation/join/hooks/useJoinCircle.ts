import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import { SlotNoLongerAvailableError } from '@/domain/circles/value-objects/Slot';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Mis círculos activos (Circles > Active, COPAYNI-26). */
export const activeCirclesQueryKey = ['circles', 'mine', 'active'] as const;

/** Confirma la unión (POST /circles/join) con la clave de idempotencia del borrador. */
export function useJoinCircle() {
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: JoinCircleDraft) => circles.joinCircle.execute(draft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activeCirclesQueryKey }),
    onError: (error) => {
      // El paso 3 tiene que volver a pedir los slots: el turno o el círculo ya no sirven.
      if (error instanceof SlotNoLongerAvailableError) {
        void queryClient.invalidateQueries({ queryKey: ['circles', 'quote', 'slots'] });
      }
    },
  });
}
