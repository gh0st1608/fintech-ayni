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

/**
 * Falla si la cadencia no está habilitada en el servidor (`CIRCLE_CADENCES_ENABLED`,
 * COPAYNI-121). Ofrecer una frecuencia que no se puede crear sería ofrecer algo que luego se
 * rechaza al unirse.
 */
export function assertCadenceEnabled(cadence: Cadence, enabled: readonly Cadence[]): void {
  if (!enabled.some((candidate) => candidate.equals(cadence))) {
    throw new ValidationError(`La frecuencia ${cadence.id} no está habilitada`, {
      cadence: 'not_enabled',
    });
  }
}

/**
 * La cadencia pedida, tras las dos puertas: habilitada en el servidor (COPAYNI-121) y declarada
 * por el cliente (COPAYNI-115).
 *
 * Son dos comprobaciones distintas y las dos hacen falta en todo punto de entrada que elija una
 * frecuencia —cuotas, slots y unión—, porque ofrecérsela a una app que no sabe dibujarla sería
 * enseñar cifras y fechas equivocadas sobre dinero real.
 */
export function requestedCadence(
  id: CadenceId | undefined,
  enabled: readonly Cadence[],
  supported: readonly Cadence[],
): Cadence {
  const cadence = id ? Cadence.parse(id) : Cadence.default;
  assertCadenceEnabled(cadence, enabled);
  assertSupportedByClient(cadence, supported);
  return cadence;
}

/** Las cadencias declaradas, o solo la mensual: es lo que hace la app publicada. */
export function clientCadences(declared: readonly CadenceId[] | undefined): Cadence[] {
  if (!declared || declared.length === 0) return [Cadence.default];
  return declared.map((id) => Cadence.parse(id));
}
