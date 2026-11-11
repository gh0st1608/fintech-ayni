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

/** Rechazos que el usuario debe resolver con otro intento: la clave de idempotencia cambia. */
const REJECTION_CODES = new Set(['CARD_REJECTED', 'YAPE_REJECTED', 'PAYMENT_REJECTED']);

/** Motivos de Mercado Pago (tarjeta `cc_rejected_*` y Yape) con un mensaje propio (D1). */
const REASONS = [
  'insufficient_amount',
  'call_for_authorize',
  'bad_filled',
  'max_attempts',
  'invalid_token',
  'processing_error',
] as const;
type Reason = (typeof REASONS)[number];

/** Normaliza el motivo de la pasarela, p. ej. `cc_rejected_insufficient_amount` o `bad_filled_card_data`. */
export function rejectionReason(detail: string | undefined): Reason | null {
  if (!detail) return null;
  const reason = detail.replace(/^cc_rejected_/, '');
  if (reason.startsWith('bad_filled')) return 'bad_filled';
  if (reason.includes('call_for_authorize')) return 'call_for_authorize';
  if (reason.startsWith('max_attempts')) return 'max_attempts';
  if (reason === 'invalid_card_token') return 'invalid_token';
  return (REASONS as readonly string[]).includes(reason) ? (reason as Reason) : null;
}

/** El pago fue rechazado: hay que reintentar con una clave de idempotencia nueva. */
export function isPaymentRejection(error: unknown): boolean {
  return error instanceof AppError && REJECTION_CODES.has(error.code ?? '');
}

export function paymentErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof AppError && (CODES as readonly string[]).includes(error.code ?? '')) {
    const reason =
      error.code === 'PAYMENT_REJECTED' ? rejectionReason(error.fieldErrors?.detail) : null;
    if (reason) return t(`payment.rejectionReasons.${reason}`);
    return t(`payment.errors.${error.code as (typeof CODES)[number]}`);
  }
  return errorMessage(t, error);
}
