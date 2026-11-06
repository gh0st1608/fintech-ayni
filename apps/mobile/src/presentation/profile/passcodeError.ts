import type { TFunction } from 'i18next';

import { InvalidPasscodeError, PasscodeMismatchError } from '@/domain/auth/value-objects/Passcode';
import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';

/** Mensaje de un rechazo del passcode, con los intentos que quedan si el backend los informa. */
export function passcodeErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof InvalidPasscodeError) return t('profile.passcode.invalidFormat');
  if (error instanceof PasscodeMismatchError) return t('profile.passcode.mismatch');
  if (error instanceof AppError && error.code === 'PASSCODE_INVALID') {
    return t('profile.passcode.wrong', {
      count: Number(error.fieldErrors?.attemptsRemaining ?? 0),
    });
  }
  return errorMessage(t, error);
}
