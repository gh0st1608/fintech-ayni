import { ValidationError } from '../../../../shared/errors/app-error';
import { Cadence, type CadenceId } from '../value-objects/cadence';

/**
 * Falla si el cliente no declaró soportar esa cadencia (COPAYNI-115).
 *
 * El rechazo es explícito y distinto del de la bandera: una cadencia puede estar habilitada en el
 * servidor y aun así no poder enviarse a una app que no sabe dibujarla.
 */
export function assertSupportedByClient(cadence: Cadence, supported: readonly Cadence[]): void {
  if (!supported.some((declared) => declared.equals(cadence))) {
    throw new ValidationError(`Tu app no admite la frecuencia ${cadence.id}`, {
      cadence: 'not_supported_by_client',
    });
  }
}

/** Las cadencias declaradas, o solo la mensual: es lo que hace la app publicada. */
export function clientCadences(declared: readonly CadenceId[] | undefined): Cadence[] {
  if (!declared || declared.length === 0) return [Cadence.default];
  return declared.map((id) => Cadence.parse(id));
}
