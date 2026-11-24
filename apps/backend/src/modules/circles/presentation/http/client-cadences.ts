import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AppRequest } from '../../../../shared/presentation/http/app-request';
import { ValidationError } from '../../../../shared/errors/app-error';
import { Cadence, CADENCE_IDS, type CadenceId } from '../../domain/value-objects/cadence';

/** Cabecera con la que el cliente declara qué cadencias sabe mostrar (COPAYNI-115). */
export const CLIENT_CADENCES_HEADER = 'x-ayni-cadences';

/**
 * Las cadencias que el cliente declara soportar, o solo la mensual si no declara nada.
 *
 * Protege a la app ya publicada en la tienda: esa versión interpreta `months`, `startsOn` y
 * `payoutPeriod` como meses y **no sabe dibujar** una junta semanal, así que si el servidor le
 * enviara una, mostraría cifras y fechas equivocadas sobre dinero real. La garantía es que el
 * servidor solo ofrece una cadencia a quien declara entenderla: una app vieja nunca recibe lo que
 * no entiende, de modo que no puede equivocarse al mostrarlo.
 *
 * Una cadencia desconocida en la cabecera es un error explícito, no un valor que se ignora: si un
 * cliente cree soportar algo que el servidor no conoce, conviene que se entere al pedirlo.
 */
export function parseClientCadences(header: string | undefined): Cadence[] {
  const declared = (header ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (declared.length === 0) return [Cadence.default];

  const unknown = declared.filter((value) => !CADENCE_IDS.includes(value as CadenceId));
  if (unknown.length > 0) {
    throw new ValidationError(`Cadencias desconocidas: ${unknown.join(', ')}`, {
      [CLIENT_CADENCES_HEADER]: 'invalid',
    });
  }
  return [...new Set(declared)].map((id) => Cadence.parse(id));
}

/** Las cadencias declaradas en la cabecera de la petición. */
export const ClientCadences = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AppRequest>();
  const header = request.headers[CLIENT_CADENCES_HEADER];
  return parseClientCadences(Array.isArray(header) ? header.join(',') : header);
});
