import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PayoutAccountForm } from '@/domain/payouts/PayoutAccount';

import { useContainer, useStaff } from '../providers/AppProviders';

export const usersKeys = {
  search: (query: string) => ['users', 'search', query] as const,
  detail: (userId: string) => ['users', 'detail', userId] as const,
};

/**
 * Cada búsqueda queda en la auditoría del backend: solo se consulta cuando hay una búsqueda enviada,
 * no mientras se escribe.
 */
export function useUserSearch(query: string | null) {
  const { users } = useContainer();
  return useQuery({
    queryKey: usersKeys.search(query ?? ''),
    queryFn: ({ signal }) => users.search.execute(query ?? '', signal),
    enabled: query !== null,
  });
}

export function useUser(userId: string) {
  const { users } = useContainer();
  return useQuery({
    queryKey: usersKeys.detail(userId),
    queryFn: ({ signal }) => users.get.execute(userId, signal),
  });
}

/** Tras una acción sobre la persona se recarga su perfil (bloqueo, sesiones). */
function useRefreshUser(userId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
}

export function useRevokeSessions(userId: string) {
  const { users } = useContainer();
  const staff = useStaff();
  return useMutation({
    mutationFn: (reason: string) => users.revokeSessions.execute(staff, userId, reason),
  });
}

export function useSetBlocked(userId: string) {
  const { users } = useContainer();
  const staff = useStaff();
  const refresh = useRefreshUser(userId);
  return useMutation({
    mutationFn: ({ action, reason }: { action: 'block' | 'unblock'; reason: string }) =>
      users.setBlocked.execute(staff, userId, action, reason),
    onSuccess: refresh,
  });
}

/** El dato completo no se guarda en caché: vive solo en el estado del diálogo. */
export function useRevealContact(userId: string) {
  const { users } = useContainer();
  const staff = useStaff();
  return useMutation({
    mutationFn: (reason: string) => users.revealContact.execute(staff, userId, reason),
  });
}

export function useSupportNotes(userId: string) {
  const { users } = useContainer();
  return useQuery({
    queryKey: ['users', 'notes', userId],
    queryFn: ({ signal }) => users.notes.execute(userId, signal),
  });
}

export function useAddSupportNote(userId: string) {
  const { users } = useContainer();
  const staff = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => users.addNote.execute(staff, userId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'notes', userId] }),
  });
}

export function usePayoutAccounts(userId: string) {
  const { users } = useContainer();
  return useQuery({
    queryKey: ['users', 'payout-account', userId],
    queryFn: ({ signal }) => users.payoutAccounts.execute(userId, signal),
  });
}

export function useRegisterPayoutAccount(userId: string) {
  const { users } = useContainer();
  const staff = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ form, reason }: { form: PayoutAccountForm; reason: string }) =>
      users.registerPayoutAccount.execute(staff, userId, form, reason),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['users', 'payout-account', userId] }),
  });
}
