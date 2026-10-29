import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect, useRef } from 'react';
import { Text } from 'react-native';

import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { SlotScreen } from './screens/SlotScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

/** Precarga los pasos 1 y 2 (30.000 en 10 cuotas) y muestra el slot guardado. */
function Draft({ complete = true }: { complete?: boolean }) {
  const { draft, start, setInstallment } = useJoinFlow();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !complete) return;
    started.current = true;
    start(pen(30_000));
  }, [complete, start]);
  useEffect(() => {
    if (draft.payoutAmount && !draft.installment) {
      setInstallment(InstallmentOption.create({ months: 10, installment: pen(3_000) }));
    }
  }, [draft, setInstallment]);
  return <Text testID="draft">{draft.slot ? `slot ${draft.slot.position}` : 'none'}</Text>;
}

function quote(options: { takenPositions?: number[] } = {}) {
  return new InMemoryCircleQuoteRepository({ latencyMs: 0, startsOn: '2026-11', ...options });
}

async function renderSlot({
  circleQuote = quote(),
  complete = true,
}: { circleQuote?: InMemoryCircleQuoteRepository; complete?: boolean } = {}) {
  const handlers = { onEditPayout: jest.fn(), onEditInstallment: jest.fn(), onNext: jest.fn() };
  const view = await renderWithProviders(
    <JoinFlowProvider>
      <Draft complete={complete} />
      <SlotScreen {...handlers} />
    </JoinFlowProvider>,
    createTestContainer({ circleQuote }),
  );
  return { ...view, ...handlers, circleQuote };
}

const slot = (position: number) => screen.findByTestId(`slot-${position}`);
const tab = (name: string) => screen.getByRole('tab', { name });

describe('SlotScreen', () => {
  it('muestra el paso 3 de 4 con el resumen editable y los tres tipos de turno', async () => {
    const { onEditPayout, onEditInstallment } = await renderSlot();
    expect(await slot(1)).toBeTruthy();
    expect(screen.getByLabelText('Paso 3 de 4')).toBeTruthy();
    expect(screen.getByTestId('join-summary')).toHaveTextContent(/30\.000.*3\.?000.* al mes · 10/);
    expect(tab('Cobro más rápido')).toBeSelected();
    expect(tab('Menos fees')).toBeTruthy();
    expect(tab('Mayor retorno')).toBeTruthy();
    expect(screen.getByTestId('slot-type-summary')).toHaveTextContent(
      /Cobras entre nov.* 2026 y dic.* 2026\. Aplican fees\./,
    );
    expect(
      screen.getByText(
        'Las Admin Fees se reparten en partes iguales sobre tus pay-ins hasta tu mes de payout.',
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Editar el monto de payout' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar la cuota mensual' }));
    expect(onEditPayout).toHaveBeenCalledTimes(1);
    expect(onEditInstallment).toHaveBeenCalledTimes(1);
  });

  it('cada tipo muestra sus meses con la posición y el fee o el descuento', async () => {
    await renderSlot();
    expect(await slot(1)).toHaveAccessibleName(/Turno 1 · .*3\.?000.* de fees/);
    expect(await slot(2)).toHaveAccessibleName(/Turno 2 · .*1\.?500.* de fees/);

    await fireEvent.press(tab('Menos fees'));
    expect(await slot(5)).toHaveAccessibleName(/Turno 5 · Sin fees$/);

    await fireEvent.press(tab('Mayor retorno'));
    expect(await slot(10)).toHaveAccessibleName(/Turno 10 · Sin fees · .*1\.?500.* de descuento/);
    expect(screen.getByTestId('slot-type-summary')).toHaveTextContent(/Descuento en tus pay-ins\./);
  });

  it('un slot ocupado aparece deshabilitado', async () => {
    await renderSlot({ circleQuote: quote({ takenPositions: [1] }) });
    expect(await slot(1)).toBeDisabled();
    expect(await slot(1)).toHaveAccessibleName(/Ocupado/);
    expect(await slot(2)).toBeEnabled();
  });

  it('un turno que la regla de confianza no permite aparece deshabilitado con su motivo (COPAYNI-60)', async () => {
    await renderSlot({
      circleQuote: new InMemoryCircleQuoteRepository({
        latencyMs: 0,
        startsOn: '2026-11',
        notAllowed: { fastestPayout: 'trustRequired' },
      }),
    });
    expect(await slot(1)).toBeDisabled();
    expect(await slot(1)).toHaveAccessibleName(/Disponible al completar tu primer círculo/);
  });

  it('al elegir un mes lo resalta, el botón lo nombra y continuar lo guarda', async () => {
    const { onNext } = await renderSlot();
    await slot(1);
    await fireEvent.press(tab('Mayor retorno'));
    await fireEvent.press(await slot(9));

    expect(await slot(9)).toBeChecked();
    const cta = screen.getByRole('button', { name: 'Continuar con julio' });
    await fireEvent.press(cta);

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('draft')).toHaveTextContent('slot 9');
  });

  it('si el slot se ocupó mientras elegía, avisa, refresca y quita la selección', async () => {
    const { circleQuote, onNext } = await renderSlot();
    await fireEvent.press(await slot(2));
    circleQuote.take(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar con diciembre' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese turno acaba de ocuparse. Elige otro mes.',
    );
    await waitFor(async () => expect(await slot(2)).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('draft')).toHaveTextContent('none');
  });

  it('sin conexión muestra un error recuperable y conserva los pasos anteriores', async () => {
    const circleQuote = quote();
    const original = circleQuote.listSlots.bind(circleQuote);
    let online = false;
    circleQuote.listSlots = jest.fn((payout: Money, months: number) =>
      online ? original(payout, months) : Promise.reject(new AppError('network', 'offline')),
    );
    await renderSlot({ circleQuote });

    // La query reintenta dos veces los fallos transitorios (1 s y 2 s) antes de mostrar el error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(
      /No hay conexión/,
    );
    expect(screen.getByTestId('join-summary')).toHaveTextContent(/30\.000/);
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await slot(1)).toBeTruthy();
  }, 10_000);

  it('sin los pasos anteriores pide volver al paso 1', async () => {
    const { onEditPayout } = await renderSlot({ complete: false });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Primero elige el monto y la cuota mensual.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Elegir el monto' }));
    expect(onEditPayout).toHaveBeenCalled();
  });
});
