import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Topes por pago que el usuario elige en Yape (S/500, S/900 o S/2.000), en unidades mayores de
 * la moneda de Yape.
 */
export const YAPE_LIMITS_MAJOR = [500, 900, 2000] as const;
const YAPE_MIN_LIMIT = 500;
const YAPE_MAX_LIMIT = 2000;

/**
 * Si se puede pagar una cuota con Yape (D1, COPAYNI-77). La app no conoce el tope que eligió el
 * usuario, así que:
 * - `unavailable`: la cuota no está en la moneda de Yape (la de operación, los soles).
 * - `over_max`: supera el tope máximo de Yape; se sugiere pagar con tarjeta.
 * - `may_exceed`: supera el tope mínimo; se avisa que puede superar el que configuró.
 * - `ok`: entra en cualquier tope.
 */
export type YapeAvailability = 'unavailable' | 'over_max' | 'may_exceed' | 'ok';

/** `yapeCurrency`: la moneda de operación de la configuración; Yape solo cobra en ella. */
export function yapeAvailability(amount: Money, yapeCurrency: string): YapeAvailability {
  if (amount.currency !== yapeCurrency) return 'unavailable';
  const major = amount.toMajor();
  if (major > YAPE_MAX_LIMIT) return 'over_max';
  if (major > YAPE_MIN_LIMIT) return 'may_exceed';
  return 'ok';
}
