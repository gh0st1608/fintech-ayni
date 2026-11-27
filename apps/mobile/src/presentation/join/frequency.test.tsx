import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { CadenceOption } from '@/domain/circles/JoinConfig';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { FrequencyScreen } from './screens/FrequencyScreen';

/**
 * El paso de frecuencia del flujo de unión (COPAYNI-116).
 *
 * Solo aparece cuando hay algo que elegir: el servidor envía las cadencias habilitadas que esta
 * app declara soportar, y con una sola el paso se salta y el flujo es el mensual de siempre, que
 * es lo que ve la app publicada.
 */
const MONTHLY: CadenceOption = { id: 'monthly', unit: 'Mes', turnDays: 30, default: true };
const WEEKLY: CadenceOption = { id: 'weekly', unit: 'Semana', turnDays: 7, default: false };
const BIWEEKLY: CadenceOption = { id: 'biweekly', unit: 'Quincena', turnDays: 14, default: false };

/** Muestra la frecuencia guardada en el borrador. */
function Draft() {
  const { draft } = useJoinFlow();
  return <Text testID="draft">{draft.cadence}</Text>;
}

async function renderFrequency(cadences: CadenceOption[] = [MONTHLY, WEEKLY, BIWEEKLY]) {
  const onNext = jest.fn();
  const joinConfig = new InMemoryJoinConfigRepository('PEN', { latencyMs: 0, cadences });
  const view = await renderWithProviders(
    <JoinFlowProvider>
      <Draft />
      <FrequencyScreen onNext={onNext} />
    </JoinFlowProvider>,
    createTestContainer({ joinConfig }),
  );
  return { ...view, onNext };
}

describe('FrequencyScreen', () => {
  it('ofrece las frecuencias que manda el servidor y ninguna más', async () => {
    await renderFrequency([MONTHLY, WEEKLY]);

    expect(await screen.findByText('¿Cada cuánto quieres pagar?')).toBeTruthy();
    expect(await screen.findByTestId('cadence-option-monthly')).toBeTruthy();
    expect(screen.getByTestId('cadence-option-weekly')).toBeTruthy();
    // La quincenal no vino en la configuración: no se ofrece.
    expect(screen.queryByTestId('cadence-option-biweekly')).toBeNull();
  });

  it('dice cada cuántos días toca un turno de cada frecuencia', async () => {
    await renderFrequency();

    expect(await screen.findByText('Un turno cada 7 días')).toBeTruthy();
    expect(screen.getByText('Un turno cada 14 días')).toBeTruthy();
    expect(screen.getByText('Un turno cada 30 días')).toBeTruthy();
  });

  it('guarda la frecuencia elegida en el borrador y continúa', async () => {
    const { onNext } = await renderFrequency();
    expect(screen.getByTestId('draft')).toHaveTextContent('monthly');

    await fireEvent.press(await screen.findByTestId('cadence-option-weekly'));

    expect(screen.getByTestId('draft')).toHaveTextContent('weekly');
    expect(onNext).toHaveBeenCalled();
  });

  it('con una sola frecuencia sigue de largo sin mostrar el paso', async () => {
    // Es la configuración de producción (CIRCLE_CADENCES_ENABLED=monthly) y la de la app
    // publicada, que no declara cadencias.
    const { onNext } = await renderFrequency([MONTHLY]);

    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(screen.queryByText('¿Cada cuánto quieres pagar?')).toBeNull();
    expect(screen.getByTestId('draft')).toHaveTextContent('monthly');
  });

  it('si la configuración falla, lo explica y permite reintentar', async () => {
    const joinConfig = new InMemoryJoinConfigRepository('PEN', { latencyMs: 0 });
    jest.spyOn(joinConfig, 'get').mockRejectedValue(new Error('boom'));
    await renderWithProviders(
      <JoinFlowProvider>
        <FrequencyScreen onNext={jest.fn()} />
      </JoinFlowProvider>,
      createTestContainer({ joinConfig }),
    );

    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
