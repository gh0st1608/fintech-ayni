import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import { TermsOutdatedError } from '@/domain/circles/JoinedCircle';
import { SlotNoLongerAvailableError } from '@/domain/circles/value-objects/Slot';
import { recommendedCirclesQueryKey } from '@/presentation/circles/useRecommendedCircles';
import { myCirclesQueryKey } from '@/presentation/circles/useMyCircles';
import { useContainer } from '@/presentation/providers/ContainerProvider';

import { JOIN_CONFIG_QUERY_KEY } from './useJoinConfig';

/** Confirma la unión (POST /circles/join) con la clave de idempotencia del borrador. */
export function useJoinCircle() {
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, termsVersion }: { draft: JoinCircleDraft; termsVersion: string }) =>
      circles.joinCircle.execute(draft, termsVersion),
    // El círculo aparece en Circles > Active (COPAYNI-26) y deja de recomendarse (COPAYNI-25).
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: myCirclesQueryKey('active') }),
        queryClient.invalidateQueries({ queryKey: recommendedCirclesQueryKey }),
      ]),
    onError: (error) => {
      // Los términos cambiaron: se vuelven a pedir para mostrar y aceptar los vigentes.
      if (error instanceof TermsOutdatedError) {
        void queryClient.invalidateQueries({ queryKey: JOIN_CONFIG_QUERY_KEY });
      }
      // El paso 3 tiene que volver a pedir los slots: el turno o el círculo ya no sirven.
      if (error instanceof SlotNoLongerAvailableError) {
        void queryClient.invalidateQueries({ queryKey: ['circles', 'quote', 'slots'] });
      }
    },
  });
}
