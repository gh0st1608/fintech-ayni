import { useQuery } from '@tanstack/react-query';

import { useContainer } from '../providers/AppProviders';

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
