import type { TFunction } from 'i18next';

import { AppError, type AppErrorKind } from '@/domain/shared/errors/AppError';

/** Clave i18n del mensaje genérico para un error (ver locales/*.json → errors). */
export function errorMessageKey(error: unknown): `errors.${AppErrorKind}` {
  return `errors.${error instanceof AppError ? error.kind : 'unknown'}`;
}

/** Mensaje traducido de un error; el rate limit indica cuánto esperar si el backend lo informa. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof AppError && error.kind === 'rate_limited' && error.retryAfterSeconds) {
    return t('errors.rateLimitedWait', { count: error.retryAfterSeconds });
  }
  return t(errorMessageKey(error));
}
