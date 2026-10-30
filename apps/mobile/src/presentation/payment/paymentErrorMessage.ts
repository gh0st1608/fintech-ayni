import type { TFunction } from 'i18next';

import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';

/** Rechazos de tarjetas y pagos con un mensaje propio; el resto usa el mensaje genérico. */
const CODES = [
  'CARD_REJECTED',
  'EMAIL_REQUIRED',
  'DEFAULT_CARD_REPLACEMENT_REQUIRED',
  'CARD_NOT_FOUND',
  'GATEWAY_NOT_CONFIGURED',
  'YAPE_REJECTED',
  'INSTALLMENT_NOT_PAYABLE',
  'PAYMENT_PENDING',
  'PAYMENT_REJECTED',
] as const;

export function paymentErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof AppError && (CODES as readonly string[]).includes(error.code ?? '')) {
    return t(`payment.errors.${error.code as (typeof CODES)[number]}`);
  }
  return errorMessage(t, error);
}
