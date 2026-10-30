import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CardDetails } from '@/domain/payments/CardDetails';
import type { InstallmentPaymentMethod } from '@/domain/payments/InstallmentPayment';
import type { SavedCard } from '@/domain/payments/SavedCard';
import { useContainer } from '@/presentation/providers/ContainerProvider';

import { payoutEligibilityQueryKey, paymentSummaryQueryKey } from './usePayments';

export const cardsQueryKey = ['payments', 'cards'] as const;

/** Tarjetas guardadas, la predeterminada primero (GET /me/cards). */
export function useCards() {
  const { payments } = useContainer();
  return useQuery({
    queryKey: cardsQueryKey,
    queryFn: ({ signal }) => payments.listCards.execute(signal),
  });
}

/** Agrega una tarjeta con la clave de idempotencia del formulario. */
export function useAddCard() {
  const { payments } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ card, idempotencyKey }: { card: CardDetails; idempotencyKey: string }) =>
      payments.addCard.execute(card, idempotencyKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
  });
}

export function useSetDefaultCard() {
  const { payments } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => payments.setDefaultCard.execute(cardId),
    onSuccess: (cards: SavedCard[]) => queryClient.setQueryData(cardsQueryKey, cards),
  });
}

export function useRemoveCard() {
  const { payments } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => payments.removeCard.execute(cardId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: cardsQueryKey }),
  });
}

/** Paga una cuota y refresca el resumen, el historial y la elegibilidad. */
export function usePayInstallment() {
  const { payments } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      installmentId,
      payment,
      idempotencyKey,
    }: {
      installmentId: string;
      payment: InstallmentPaymentMethod;
      idempotencyKey: string;
    }) => payments.payInstallment.execute(installmentId, payment, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentSummaryQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['payments', 'transactions'] });
      void queryClient.invalidateQueries({ queryKey: payoutEligibilityQueryKey });
    },
  });
}
