import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import { SlotNoLongerAvailableError } from '@/domain/circles/value-objects/Slot';
import { recommendedCirclesQueryKey } from '@/presentation/circles/useRecommendedCircles';
import { myCirclesQueryKey } from '@/presentation/circles/useMyCircles';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Confirma la unión (POST /circles/join) con la clave de idempotencia del borrador. */
export function useJoinCircle() {
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: JoinCircleDraft) => circles.joinCircle.execute(draft),
    // El círculo aparece en Circles > Active (COPAYNI-26) y deja de recomendarse (COPAYNI-25).
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: myCirclesQueryKey('active') }),
        queryClient.invalidateQueries({ queryKey: recommendedCirclesQueryKey }),
      ]),
    onError: (error) => {
      // El paso 3 tiene que volver a pedir los slots: el turno o el círculo ya no sirven.
      if (error instanceof SlotNoLongerAvailableError) {
        void queryClient.invalidateQueries({ queryKey: ['circles', 'quote', 'slots'] });
      }
    },
  });
}
