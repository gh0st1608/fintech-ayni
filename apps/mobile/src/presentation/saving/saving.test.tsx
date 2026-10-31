import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemorySavingPlanRepository } from '@/infrastructure/savings/InMemorySavingPlanRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { SavingCirclesScreen } from './screens/SavingCirclesScreen';

const savings = (options = {}) =>
  new InMemorySavingPlanRepository({
    latencyMs: 0,
    currency: 'PEN',
    now: () => new Date(2026, 9, 31),
    ...options,
  });

describe('SavingCirclesScreen (COPAYNI-32)', () => {
  it('lista los planes con nombre traducido, monto y "hasta X extra"', async () => {
    await renderWithProviders(<SavingCirclesScreen />);
    expect(await screen.findByTestId('saving-plan-lite')).toHaveTextContent(
      /Lite.*3\.?000.*Hasta .*600.* extra/,
    );
    expect(screen.getByTestId('saving-plan-diamond')).toHaveTextContent(/Diamante/);
  });

  it('un plan sin traducción se muestra con su clave', async () => {
    await renderWithProviders(
      <SavingCirclesScreen />,
      createTestContainer({ savings: savings({ plans: { titanium: 500000 } }) }),
    );
    expect(await screen.findByTestId('saving-plan-titanium')).toHaveTextContent(/titanium/);
  });

  it('sin planes muestra el estado vacío', async () => {
    await renderWithProviders(
      <SavingCirclesScreen />,
      createTestContainer({ savings: savings({ plans: {} }) }),
    );
    expect(await screen.findByTestId('saving-empty')).toBeTruthy();
  });

  it('un error al cargar se puede reintentar', async () => {
    const repository = savings();
    const failing = jest
      .spyOn(repository, 'list')
      .mockRejectedValue(new AppError('network', 'offline'));
    await renderWithProviders(
      <SavingCirclesScreen />,
      createTestContainer({ savings: repository }),
    );
    expect(await screen.findByText(/No hay conexión/, {}, { timeout: 5000 })).toBeTruthy();
    failing.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('saving-plan-lite')).toBeTruthy();
  }, 10_000);
});

describe('DurationSheet (COPAYNI-33)', () => {
  it('muestra la cuota de cada duración y el detalle de la elegida', async () => {
    await renderWithProviders(<SavingCirclesScreen />);
    await fireEvent.press(await screen.findByTestId('saving-plan-lite'));

    // Figma 55:9220: la primera duración viene elegida, con su detalle a la vista.
    expect(await screen.findByTestId('duration-6')).toHaveTextContent(/6\s*Meses.*500.*al mes/);
    expect(screen.getByTestId('duration-12')).toHaveTextContent(/12\s*Meses.*250.*al mes/);
    expect(screen.getByTestId('duration-24')).toHaveTextContent(/24\s*Meses.*125.*al mes/);
    expect(screen.getByRole('radio', { name: /^6 Meses/ })).toBeChecked();
    expect(await screen.findByTestId('quote-startsOn')).toHaveTextContent(/Inicio.*nov.*2026/i);
    expect(screen.getByTestId('quote-payout')).toHaveTextContent(/may.*2027/i);
    // El total del Figma ya incluye el cashback.
    expect(screen.getByTestId('quote-total')).toHaveTextContent(/Total a recibir.*3\.?150/);

    await fireEvent.press(screen.getByTestId('duration-12'));
    await waitFor(() => expect(screen.getByTestId('quote-payout')).toHaveTextContent(/nov.*2027/i));
    expect(screen.getByRole('radio', { name: /^12 Meses/ })).toBeChecked();

    // La confirmación espera el diseño (D5): Siguiente lo explica sin cerrar la hoja.
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('saving-pending')).toBeTruthy();
  });

  it('una cotización incoherente no se muestra', async () => {
    const repository = savings();
    const original = repository.quote.bind(repository);
    jest.spyOn(repository, 'quote').mockImplementation(async (planId, months) => ({
      ...(await original(planId, months)),
      startsOn: '2027-06',
      payoutPeriod: '2026-12',
    }));
    await renderWithProviders(
      <SavingCirclesScreen />,
      createTestContainer({ savings: repository }),
    );
    await fireEvent.press(await screen.findByTestId('saving-plan-lite'));
    await fireEvent.press(await screen.findByTestId('duration-12'));
    expect(
      await screen.findByText('No pudimos calcular este plan. Inténtalo más tarde.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('quote-details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('sin conexión muestra un error recuperable sin cerrar la hoja; la X la cierra', async () => {
    const repository = savings();
    const failing = jest
      .spyOn(repository, 'quote')
      .mockRejectedValue(new AppError('network', 'offline'));
    await renderWithProviders(
      <SavingCirclesScreen />,
      createTestContainer({ savings: repository }),
    );
    await fireEvent.press(await screen.findByTestId('saving-plan-lite'));
    await fireEvent.press(screen.getByTestId('duration-6'));
    expect(await screen.findByTestId('quote-error', {}, { timeout: 5000 })).toHaveTextContent(
      /No hay conexión/,
    );

    failing.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('quote-details')).toBeTruthy();

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Cerrar la elección de duración' })[0]!,
    );
    await waitFor(() => expect(screen.queryByTestId('quote-details')).toBeNull());
  }, 10_000);
});
