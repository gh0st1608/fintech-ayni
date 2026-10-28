import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect, useRef } from 'react';
import { Text } from 'react-native';

import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { Slot } from '@/domain/circles/value-objects/Slot';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryPayoutMethodRepository } from '@/infrastructure/payouts/InMemoryPayoutMethodRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { PayoutMethodScreen } from './screens/PayoutMethodScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');
const SLOT = Slot.create({
  position: 9,
  payoutPeriod: '2027-07',
  type: 'highestReturn',
  fee: pen(0),
  discount: pen(750),
  available: true,
});

/** Precarga los pasos 1 a 3 y muestra el método guardado en el borrador. */
function Draft({ complete = true }: { complete?: boolean }) {
  const { draft, start, setInstallment, setSlot } = useJoinFlow();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !complete) return;
    started.current = true;
    start(pen(30_000));
  }, [complete, start]);
  useEffect(() => {
    if (draft.payoutAmount && !draft.installment) {
      setInstallment(InstallmentOption.create({ months: 10, installment: pen(3_000) }));
    } else if (draft.installment && !draft.slot) {
      setSlot(SLOT);
    }
  }, [draft, setInstallment, setSlot]);
  return <Text testID="draft">{draft.payoutMethod ?? 'none'}</Text>;
}

async function renderMethods({
  payoutMethods = new InMemoryPayoutMethodRepository('PEN', { latencyMs: 0 }),
  complete = true,
}: { payoutMethods?: InMemoryPayoutMethodRepository; complete?: boolean } = {}) {
  const handlers = { onStartOver: jest.fn(), onNext: jest.fn() };
  const view = await renderWithProviders(
    <JoinFlowProvider>
      <Draft complete={complete} />
      <PayoutMethodScreen {...handlers} />
    </JoinFlowProvider>,
    createTestContainer({ payoutMethods }),
  );
  return { ...view, ...handlers, payoutMethods };
}

const method = (type: string) => screen.findByTestId(`payout-method-${type}`);
const cta = () => screen.getByRole('button', { name: 'Continuar' });

describe('PayoutMethodScreen', () => {
  it('muestra el paso 4 de 4 con los métodos, sus badges y el límite de la tarjeta', async () => {
    await renderMethods();
    expect(await method('digitalWallet')).toHaveAccessibleName(/Billetera digital/);
    expect(screen.getByLabelText('Paso 4 de 4')).toBeTruthy();
    expect(await method('prepaidCard')).toHaveAccessibleName(
      /Tarjeta prepago.*Sin costo.*Límite de .*100\.?000.* por payout/,
    );
    expect(await method('bankTransfer')).toHaveAccessibleName(/Transferencia bancaria.*Sin costo/);
    expect(await method('digitalWallet')).not.toHaveAccessibleName(/Sin costo/);
    expect(screen.getByText('Puedes cambiarlo hasta antes de tu mes de payout.')).toBeTruthy();
    expect(cta()).toBeDisabled();
  });

  it('preselecciona el método guardado', async () => {
    await renderMethods({
      payoutMethods: new InMemoryPayoutMethodRepository('PEN', {
        latencyMs: 0,
        selected: 'bankTransfer',
      }),
    });
    expect(await method('bankTransfer')).toBeChecked();
    expect(cta()).toBeEnabled();
  });

  it('al continuar guarda el método en el backend y en el borrador', async () => {
    const { onNext, payoutMethods } = await renderMethods();
    await fireEvent.press(await method('digitalWallet'));
    expect(await method('digitalWallet')).toBeChecked();
    await fireEvent.press(cta());

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(payoutMethods.selected).toBe('digitalWallet');
    expect(screen.getByTestId('draft')).toHaveTextContent('digitalWallet');
  });

  it('en el mes de payout explica que no puede cambiarlo', async () => {
    const { onNext } = await renderMethods({
      payoutMethods: new InMemoryPayoutMethodRepository('PEN', {
        latencyMs: 0,
        selected: 'prepaidCard',
        changeLocked: true,
      }),
    });
    await fireEvent.press(await method('bankTransfer'));
    await fireEvent.press(cta());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Estás en tu mes de payout: ya no puedes cambiar el método de cobro.',
    );
    expect(onNext).not.toHaveBeenCalled();
    // Elegir otro método borra el aviso.
    await fireEvent.press(await method('prepaidCard'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sin conexión muestra un error recuperable', async () => {
    const payoutMethods = new InMemoryPayoutMethodRepository('PEN', { latencyMs: 0 });
    const original = payoutMethods.list.bind(payoutMethods);
    let online = false;
    payoutMethods.list = jest.fn((signal?: AbortSignal) =>
      online ? original(signal) : Promise.reject(new AppError('network', 'offline')),
    );
    await renderMethods({ payoutMethods });

    // La query reintenta dos veces los fallos transitorios (1 s y 2 s) antes de mostrar el error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(
      /No hay conexión/,
    );
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await method('bankTransfer')).toBeTruthy();
  }, 10_000);

  it('sin los pasos anteriores pide volver al paso 1', async () => {
    const { onStartOver } = await renderMethods({ complete: false });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Primero elige el monto, la cuota y tu turno.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Elegir el monto' }));
    expect(onStartOver).toHaveBeenCalled();
  });
});
