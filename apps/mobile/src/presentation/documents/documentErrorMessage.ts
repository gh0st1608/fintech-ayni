import type { TFunction } from 'i18next';

import { InvalidIncomeProofError } from '@/application/documents/usecases/documentUseCases';
import { PermissionDeniedError } from '@/domain/documents/ports/FilePorts';
import { UnsupportedFileError } from '@/domain/documents/LocalFile';
import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';

/** Mensajes de la captura y el envío de documentos. */
export function documentErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof PermissionDeniedError) {
    return t(`documents.errors.permission.${error.permission}`);
  }
  if (error instanceof UnsupportedFileError) return t(`documents.errors.file.${error.problem}`);
  if (error instanceof InvalidIncomeProofError)
    return t(`documents.errors.income.${error.problem}`);
  if (error instanceof AppError && error.code === 'UPLOAD_NOT_USABLE') {
    return t('documents.errors.uploadNotUsable');
  }
  return errorMessage(t, error);
}
