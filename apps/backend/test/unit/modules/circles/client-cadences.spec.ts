import {
  CLIENT_CADENCES_HEADER,
  parseClientCadences,
} from '@src/modules/circles/presentation/http/client-cadences';
import {
  assertSupportedByClient,
  clientCadences,
} from '@src/modules/circles/domain/services/client-capability';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';

/**
 * La negociación de capacidad del cliente (COPAYNI-115).
 *
 * La app publicada en la tienda interpreta `months`, `startsOn` y `payoutPeriod` como meses y no
 * sabe dibujar una junta semanal: si el servidor le enviara una, mostraría cifras y fechas
 * equivocadas sobre dinero real. La garantía es que el servidor solo ofrece una cadencia a quien
 * declara entenderla, y la app publicada no declara nada.
 */
const ids = (cadences: Cadence[]) => cadences.map(({ id }) => id);

describe('Capacidad declarada por el cliente (COPAYNI-115)', () => {
  it('sin cabecera solo hay mensual: es lo que hace la app publicada', () => {
    expect(ids(parseClientCadences(undefined))).toEqual(['monthly']);
    expect(ids(parseClientCadences(''))).toEqual(['monthly']);
    expect(ids(parseClientCadences('   '))).toEqual(['monthly']);
  });

  it('acepta la lista declarada, con espacios y repetidos', () => {
    expect(ids(parseClientCadences('monthly,weekly'))).toEqual(['monthly', 'weekly']);
    expect(ids(parseClientCadences(' weekly , monthly '))).toEqual(['weekly', 'monthly']);
    expect(ids(parseClientCadences('weekly,weekly'))).toEqual(['weekly']);
  });

  it('una cadencia desconocida es un error explícito, no un valor que se ignora', () => {
    // Si un cliente cree soportar algo que el servidor no conoce, conviene que se entere al
    // pedirlo y no que reciba una lista recortada sin explicación.
    expect(() => parseClientCadences('monthly,trimestral')).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: { [CLIENT_CADENCES_HEADER]: 'invalid' },
      }),
    );
  });

  it('rechaza operar sobre una cadencia que el cliente no declaró', () => {
    expect(() => assertSupportedByClient(Cadence.weekly, [Cadence.monthly])).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: { cadence: 'not_supported_by_client' },
      }),
    );
    expect(() =>
      assertSupportedByClient(Cadence.weekly, [Cadence.monthly, Cadence.weekly]),
    ).not.toThrow();
  });

  it('el rechazo del cliente se distingue del de la bandera del servidor', () => {
    // Son dos puertas distintas: una cadencia puede estar habilitada en el servidor y aun así no
    // poder enviarse a una app que no sabe dibujarla.
    try {
      assertSupportedByClient(Cadence.weekly, [Cadence.monthly]);
      throw new Error('debería haber fallado');
    } catch (error) {
      expect((error as { details?: Record<string, string> }).details).toEqual({
        cadence: 'not_supported_by_client',
      });
    }
  });

  it('lo declarado en el comando se interpreta igual que la cabecera', () => {
    expect(ids(clientCadences(undefined))).toEqual(['monthly']);
    expect(ids(clientCadences([]))).toEqual(['monthly']);
    expect(ids(clientCadences(['weekly', 'monthly']))).toEqual(['weekly', 'monthly']);
  });
});
