import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PaymentSettings } from '@/domain/payments/PaymentSettings';

import type { TransactionType } from '@/domain/payments/Transaction';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const paymentSummaryQueryKey = ['payments', 'summary'] as const;
/** La invalida también el cambio de método de cobro (usePayoutMethods). */
export const payoutEligibilityQueryKey = ['payments', 'eligibility'] as const;
export const paymentSettingsQueryKey = ['payments', 'settings'] as const;
export const transactionsQueryKey = (type: TransactionType) =>
  ['payments', 'transactions', type] as const;

/** Resumen de la pestaña Payment (GET /me/payments/summary). */
export function usePaymentSummary() {
  const { payments } = useContainer();
  return useQuery({
    queryKey: paymentSummaryQueryKey,
    queryFn: ({ signal }) => payments.getSummary.execute(signal),
  });
}

/** Historial de pagos o cobros, página a página (GET /me/transactions). */
export function useTransactions(type: TransactionType) {
  const { payments } = useContainer();
  return useInfiniteQuery({
    queryKey: transactionsQueryKey(type),
    queryFn: ({ pageParam, signal }) => payments.listTransactions.execute(type, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/** Checklist de Payout Eligibility (GET /me/payout-eligibility). */
export function usePayoutEligibility() {
  const { payments } = useContainer();
  return useQuery({
    queryKey: payoutEligibilityQueryKey,
    queryFn: ({ signal }) => payments.getPayoutEligibility.execute(signal),
  });
}

/** Preferencias de Payment Settings (GET /me/payment-settings). */
export function usePaymentSettings() {
  const { payments } = useContainer();
  return useQuery({
    queryKey: paymentSettingsQueryKey,
    queryFn: ({ signal }) => payments.getSettings.execute(signal),
  });
}

/**
 * Guarda las preferencias (PATCH /me/payment-settings). El interruptor cambia al instante y vuelve
 * al valor anterior si el backend rechaza el cambio.
 */
export function useUpdatePaymentSettings() {
  const { payments } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: PaymentSettings) => payments.updateSettings.execute(settings),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: paymentSettingsQueryKey });
      const previous = queryClient.getQueryData<PaymentSettings>(paymentSettingsQueryKey);
      queryClient.setQueryData(paymentSettingsQueryKey, settings);
      return { previous };
    },
    onError: (_error, _settings, context) => {
      if (context?.previous) queryClient.setQueryData(paymentSettingsQueryKey, context.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(paymentSettingsQueryKey, saved),
  });
}
