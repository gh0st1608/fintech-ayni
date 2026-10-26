import { AppError, type AppErrorKind } from '@/domain/shared/errors/AppError';

/** Clave i18n del mensaje genérico para un error (ver locales/*.json → errors). */
export function errorMessageKey(error: unknown): `errors.${AppErrorKind}` {
  return `errors.${error instanceof AppError ? error.kind : 'unknown'}`;
}
