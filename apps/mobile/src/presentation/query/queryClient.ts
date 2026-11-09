import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { AppError } from '@/domain/shared/errors/AppError';

import type { ConnectivityTracker } from './connectivity';

const MAX_QUERY_RETRIES = 2;

/** Solo las lecturas con fallos transitorios se reintentan; las mutaciones nunca se reintentan solas. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return error instanceof AppError && error.isTransient && failureCount < MAX_QUERY_RETRIES;
}

/** Con `connectivity`, cada lectura y cada mutación informan si hubo conexión (D10). */
export function createQueryClient(connectivity?: ConnectivityTracker): QueryClient {
  const observe = {
    onError: (error: unknown) => connectivity?.reportError(error),
    onSuccess: () => connectivity?.reportResponse(),
  };
  return new QueryClient({
    queryCache: new QueryCache(observe),
    mutationCache: new MutationCache(observe),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
