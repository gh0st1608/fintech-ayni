import { QueryClient } from '@tanstack/react-query';

import { AppError } from '@/domain/shared/errors/AppError';

const MAX_QUERY_RETRIES = 2;

/** Solo las lecturas con fallos transitorios se reintentan; las mutaciones nunca se reintentan solas. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return error instanceof AppError && error.isTransient && failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
