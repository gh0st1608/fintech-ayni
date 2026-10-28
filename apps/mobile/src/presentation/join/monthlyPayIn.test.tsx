import { fireEvent, screen } from '@testing-library/react-native';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { MonthlyPayInScreen } from './screens/MonthlyPayInScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

/** Precarga el monto del paso 1 y muestra la cuota guardada en el borrador. */
function Draft({ payout }: { payout: number | null }) {
  const { draft, start } = useJoinFlow();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || payout === null) return;
    started.current = true;
    start(pen(payout));
  }, [payout, start]);
  const installment = draft.installment;
  return (
    <Text testID="draft">
      {installment ? `${installment.months}x${installment.installment.toMajor()}` : 'none'}
    </Text>
  );
}

async function renderPayIn({
  payout = 30_000 as number | null,
  setup = createTestContainer(),
} = {}) {
  const onEdit = jest.fn();
  const onNext = jest.fn();
  const view = await renderWithProviders(
    <JoinFlowProvider>
      <Draft payout={payout} />
      <MonthlyPayInScreen onEdit={onEdit} onNext={onNext} />
    </JoinFlowProvider>,
    setup,
  );
  return { ...view, onEdit, onNext };
}

const option = (name: RegExp) => screen.findByRole('radio', { name });

describe('MonthlyPayInScreen', () => {
  it('muestra el paso 2 de 4 con el resumen del monto y las combinaciones del backend', async () => {
    await renderPayIn();
    expect(screen.getByLabelText('Paso 2 de 4')).toBeTruthy();
    expect(screen.getByTestId('join-summary')).toHaveTextContent(/Monto de payout.*30\.000/);
    // Intl en español no agrupa los miles de 4 cifras: "5000", no "5.000".
    expect(await option(/5\.?000.*al mes.*6 meses/)).toBeTruthy();
    expect(await option(/3\.?000.*al mes.*10 meses/)).toBeTruthy();
    expect(await option(/2\.?500.*al mes.*12 meses/)).toBeTruthy();
    expect(
      screen.getByText('La cuota mensual puede variar según los fees o descuentos de tu slot.'),
    ).toBeTruthy();
  });

  it('Siguiente se habilita al elegir y guarda la cuota en el borrador', async () => {
    const { onNext } = await renderPayIn();
    const tenMonths = await option(/10 meses/);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await fireEvent.press(tenMonths);
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));

    expect(screen.getByTestId('draft')).toHaveTextContent('10x3000');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('Editar vuelve al paso 1', async () => {
    const { onEdit } = await renderPayIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Editar el monto de payout' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('una cuota que supera el límite mensual aparece deshabilitada con el motivo', async () => {
    const setup = createTestContainer({
      circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0, monthlyPayInLimit: 3_000 }),
    });
    await renderPayIn({ setup });

    const exceeded = await option(/6 meses/);
    expect(exceeded).toBeDisabled();
    expect(exceeded).toHaveAccessibleName(/Supera tu límite mensual de pay-in/);
    expect(await option(/10 meses/)).toBeEnabled();
  });

  it('sin combinaciones posibles lo explica', async () => {
    const setup = createTestContainer({
      circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0, durations: [7] }),
    });
    await renderPayIn({ setup });
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay cuotas disponibles/);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('sin conexión muestra un error recuperable y conserva el monto', async () => {
    const circleQuote = new InMemoryCircleQuoteRepository({ latencyMs: 0 });
    const original = circleQuote.listInstallmentOptions.bind(circleQuote);
    let online = false;
    circleQuote.listInstallmentOptions = jest.fn((payout: Money) =>
      online ? original(payout) : Promise.reject(new AppError('network', 'offline')),
    );
    await renderPayIn({ setup: createTestContainer({ circleQuote }) });

    // La query reintenta dos veces los fallos transitorios (1 s y 2 s) antes de mostrar el error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(
      /No hay conexión/,
    );
    expect(screen.getByTestId('join-summary')).toHaveTextContent(/30\.000/);
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await option(/6 meses/)).toBeTruthy();
  }, 10_000);

  it('al volver del paso 3 conserva la cuota elegida', async () => {
    // Desmontar y montar la pantalla con el mismo borrador equivale a volver atrás.
    function Host() {
      const [mounted, setMounted] = useState(true);
      return (
        <JoinFlowProvider>
          <Draft payout={30_000} />
          <Text testID="toggle" onPress={() => setMounted((value) => !value)}>
            toggle
          </Text>
          {mounted && <MonthlyPayInScreen onEdit={jest.fn()} onNext={jest.fn()} />}
        </JoinFlowProvider>
      );
    }
    await renderWithProviders(<Host />);
    await fireEvent.press(await option(/12 meses/));
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));

    await fireEvent.press(screen.getByTestId('toggle'));
    await fireEvent.press(screen.getByTestId('toggle'));

    expect(await option(/12 meses/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('cambiar el monto en el paso 1 descarta la cuota elegida', async () => {
    function Host() {
      const { draft, setPayoutAmount } = useJoinFlow();
      return (
        <>
          <Text testID="change" onPress={() => setPayoutAmount(pen(60_000))}>
            change
          </Text>
          <Text testID="same" onPress={() => setPayoutAmount(draft.payoutAmount ?? pen(0))}>
            same
          </Text>
        </>
      );
    }
    await renderWithProviders(
      <JoinFlowProvider>
        <Draft payout={30_000} />
        <Host />
        <MonthlyPayInScreen onEdit={jest.fn()} onNext={jest.fn()} />
      </JoinFlowProvider>,
    );
    await fireEvent.press(await option(/12 meses/));
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));

    await fireEvent.press(screen.getByTestId('same'));
    expect(screen.getByTestId('draft')).toHaveTextContent('12x2500');
    await fireEvent.press(screen.getByTestId('change'));
    expect(screen.getByTestId('draft')).toHaveTextContent('none');
  });

  it('sin monto elegido pide volver al paso 1', async () => {
    const { onEdit } = await renderPayIn({ payout: null });
    expect(screen.getByRole('alert')).toHaveTextContent('Primero elige el monto de payout.');
    await fireEvent.press(screen.getByRole('button', { name: 'Elegir el monto' }));
    expect(onEdit).toHaveBeenCalled();
  });
});
