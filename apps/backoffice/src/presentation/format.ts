import type { CycleState, Money } from '@/domain/circles/Circle';
import { AppError } from '@/domain/shared/AppError';

const LOCALE = 'es-PE';

/** `amount` está en unidades menores (céntimos). */
export function formatMoney({ amount, currency }: Money): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount / 100);
}

/** `YYYY-MM` → "dic. 2026". */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

/** `YYYY-MM-DD` al mediodía local: leído como UTC sería el día anterior en Lima. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(
    new Date(`${day}T12:00:00`),
  );
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export const STATE_LABELS: Record<CycleState, string> = {
  collecting: 'Juntando miembros',
  approving: 'Esperando aprobación',
  contributing: 'En curso',
  paused: 'Pausada',
  finished: 'Finalizada',
  cancelled: 'Cancelada',
};

/** Mensaje para la persona; el detalle técnico queda en el `traceId`, no en la pantalla. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof AppError)) return 'Ocurrió un error inesperado.';
  switch (error.kind) {
    case 'validation':
    case 'business':
    case 'conflict':
      return error.message;
    case 'not_found':
      return 'No encontramos lo que buscas.';
    case 'forbidden':
      return 'Tu rol no permite esta acción.';
    case 'unauthorized':
      return 'Tu sesión terminó. Vuelve a iniciar sesión.';
    case 'step_up_required':
      return 'Por seguridad, vuelve a iniciar sesión para confirmar esta acción.';
    case 'rate_limited':
      return 'Demasiados intentos. Espera un momento.';
    case 'network':
      return 'Sin conexión con el servidor. Revisa tu red e inténtalo otra vez.';
    case 'timeout':
      return 'El servidor tardó demasiado. Inténtalo otra vez.';
    default:
      return 'El servidor no pudo completar la operación. Inténtalo otra vez.';
  }
}
