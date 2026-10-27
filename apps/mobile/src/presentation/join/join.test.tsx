import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryJoinConfigRepository } from '@/infrastructure/circles/InMemoryJoinConfigRepository';
import { formatMoney } from '@/presentation/formatters/formatMoney';
import { snapToStep, valueFromPosition } from '@/presentation/shared/components/Slider';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { JoinFlowProvider, useJoinFlow } from './JoinFlowProvider';
import { JoinScreen } from './screens/JoinScreen';
import { PayoutAmountScreen } from './screens/PayoutAmountScreen';

/** Monto en la moneda de prueba tal como lo formatea la app en español. */
const fmt = (major: number) =>
  formatMoney(Money.fromMajor(major, 'PEN'), 'es', { trimZeroDecimals: true });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Coincidencia parcial con montos formateados: text`hasta ${120_000}`. Intl separa con
 * espacios no separables, así que cualquier espacio vale.
 */
const text = (parts: TemplateStringsArray, ...amounts: number[]) =>
  new RegExp(
    escapeRegExp(parts.reduce((acc, part, index) => acc + fmt(amounts[index - 1]!) + part)).replace(
      /\s/g,
      '\\s',
    ),
  );

/** Muestra el monto del borrador para comprobar lo que guarda cada paso. */
function DraftProbe() {
  const { draft, start } = useJoinFlow();
  return (
    <>
      <Text testID="draft">{draft.payoutAmount?.toMajor() ?? 'empty'}</Text>
      <Text testID="preset" onPress={() => start(Money.fromMajor(6000, 'PEN'))}>
        preset
      </Text>
    </>
  );
}

function withFlow(ui: React.ReactElement) {
  return (
    <JoinFlowProvider>
      {ui}
      <DraftProbe />
    </JoinFlowProvider>
  );
}

describe('JoinScreen', () => {
  it('muestra las dos opciones y añade los montos máximos cuando cargan', async () => {
    const setup = createTestContainer({
      joinConfig: new InMemoryJoinConfigRepository('PEN', { latencyMs: 50 }),
    });
    await renderWithProviders(
      withFlow(<JoinScreen onJoinGameya={jest.fn()} onJoinSavingProgram={jest.fn()} />),
      setup,
    );

    expect(screen.getByRole('header', { name: '¿Qué te gustaría hacer?' })).toBeTruthy();
    // Mientras carga, sin monto.
    expect(
      screen.getByText('Elige tu turno preferido y el monto de payout que quieras.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Ahorra en cuotas y recíbelo al final del plazo elegido, con cashback.'),
    ).toBeTruthy();

    expect(
      await screen.findByText(text`monto de payout de hasta ${120_000} por Game'ya`),
    ).toBeTruthy();
    expect(screen.getByText(text`Ahorra en cuotas hasta ${1_000_000} y recíbelo`)).toBeTruthy();
  });

  it('cada opción llama a su callback; Game’ya empieza un borrador limpio', async () => {
    const onJoinGameya = jest.fn();
    const onJoinSavingProgram = jest.fn();
    await renderWithProviders(
      withFlow(
        <JoinScreen onJoinGameya={onJoinGameya} onJoinSavingProgram={onJoinSavingProgram} />,
      ),
    );

    await fireEvent.press(screen.getByTestId('preset'));
    expect(screen.getByTestId('draft')).toHaveTextContent('6000');

    await fireEvent.press(screen.getByRole('button', { name: /Unirme a un Game'ya/ }));
    expect(onJoinGameya).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('draft')).toHaveTextContent('empty');

    await fireEvent.press(screen.getByRole('button', { name: /programa de ahorro/ }));
    expect(onJoinSavingProgram).toHaveBeenCalledTimes(1);
  });
});

describe('PayoutAmountScreen', () => {
  async function renderPayout(
    options: { userPayoutLimit?: number; repository?: InMemoryJoinConfigRepository } = {},
  ) {
    const joinConfig =
      options.repository ??
      new InMemoryJoinConfigRepository('PEN', {
        latencyMs: 0,
        userPayoutLimit: options.userPayoutLimit,
      });
    const onNext = jest.fn();
    const view = await renderWithProviders(
      withFlow(<PayoutAmountScreen onNext={onNext} />),
      createTestContainer({ joinConfig }),
    );
    await screen.findByTestId('payout-slider');
    return { ...view, onNext };
  }

  const amount = () => screen.getByTestId('payout-amount');
  const slider = () => screen.getByTestId('payout-slider');

  it('muestra el paso 1 de 4 y empieza en el mínimo', async () => {
    await renderPayout();
    expect(screen.getByRole('progressbar', { name: 'Paso 1 de 4' })).toBeTruthy();
    expect(amount()).toHaveTextContent(text`${3_000}`);
    expect(slider().props.accessibilityValue).toMatchObject({ now: 300_000, text: fmt(3000) });
  });

  it('el lector de pantalla ajusta el monto de a un salto sin salir del rango', async () => {
    await renderPayout();
    await fireEvent(slider(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(amount()).toHaveTextContent(text`${3_500}`);
    await fireEvent(slider(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(slider(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(amount()).toHaveTextContent(text`${3_000}`);
  });

  it('arrastrar sobre la pista actualiza el monto en saltos del paso', async () => {
    await renderPayout();
    await fireEvent(slider(), 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(slider(), 'responderGrant', { nativeEvent: { locationX: 100 } });
    // 3.000 + 50% de 117.000 = 61.500
    expect(amount()).toHaveTextContent(text`${61_500}`);
    await fireEvent(slider(), 'responderMove', { nativeEvent: { locationX: 500 } });
    expect(amount()).toHaveTextContent(text`${120_000}`);
  });

  it('Next guarda el monto en el borrador y avanza', async () => {
    const { onNext } = await renderPayout();
    await fireEvent(slider(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('draft')).toHaveTextContent('3500');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('con "Join now" parte del monto precargado', async () => {
    await renderPayout();
    await fireEvent.press(screen.getByTestId('preset'));
    expect(amount()).toHaveTextContent(text`${6_000}`);
  });

  it('limita el máximo al del usuario y explica cómo aumentarlo', async () => {
    await renderPayout({ userPayoutLimit: 20000 });
    expect(screen.getByTestId('payout-user-limit')).toHaveTextContent(
      text`permite un payout de hasta ${20_000}`,
    );
    expect(slider().props.accessibilityValue).toMatchObject({ max: 2_000_000 });
  });

  it('si el límite no alcanza el mínimo, no ofrece el slider', async () => {
    const joinConfig = new InMemoryJoinConfigRepository('PEN', {
      latencyMs: 0,
      userPayoutLimit: 1000,
    });
    await renderWithProviders(
      withFlow(<PayoutAmountScreen onNext={jest.fn()} />),
      createTestContainer({ joinConfig }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/no alcanza el payout mínimo/);
    expect(screen.queryByTestId('payout-slider')).toBeNull();
  });

  it('ante un error al cargar muestra un mensaje y permite reintentar', async () => {
    const repository = new InMemoryJoinConfigRepository('PEN', { latencyMs: 0 });
    const get = jest
      .spyOn(repository, 'get')
      .mockRejectedValueOnce(new AppError('validation', 'bad config'));
    await renderWithProviders(
      withFlow(<PayoutAmountScreen onNext={jest.fn()} />),
      createTestContainer({ joinConfig: repository }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos ingresados.');

    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByTestId('payout-slider')).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('Slider', () => {
  const range = { min: 0, max: 100, step: 10 };

  it('snapToStep redondea al salto y respeta los límites', () => {
    expect(snapToStep(14, range)).toBe(10);
    expect(snapToStep(15, range)).toBe(20);
    expect(snapToStep(-5, range)).toBe(0);
    expect(snapToStep(130, range)).toBe(100);
  });

  it('valueFromPosition convierte la posición en un valor del rango', () => {
    expect(valueFromPosition(50, 200, range)).toBe(30);
    expect(valueFromPosition(-10, 200, range)).toBe(0);
    expect(valueFromPosition(10, 0, range)).toBe(0);
  });
});
