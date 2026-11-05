import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/presentation/shared/hooks/useReducedMotion';
import { colors } from '@/presentation/theme/tokens';

import { BottomSheet } from './BottomSheet';
import { CircleCard, type CircleCardProps } from './CircleCard';
import { Stepper } from './Stepper';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type ReduceMotionListener = (enabled: boolean) => void;

function mockReduceMotion(initial: boolean) {
  let listener: ReduceMotionListener | undefined;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as ReduceMotionListener;
    return { remove } as never;
  });
  return { emit: (enabled: boolean) => listener?.(enabled), remove };
}

afterEach(() => jest.restoreAllMocks());

describe('useReducedMotion', () => {
  it('lee la preferencia del sistema y sigue sus cambios', async () => {
    const motion = mockReduceMotion(true);
    const { result, unmount } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));

    await act(() => motion.emit(false));
    expect(result.current).toBe(false);

    await unmount();
    expect(motion.remove).toHaveBeenCalled();
  });

  it('si la consulta falla asume movimiento normal', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('n/a'));
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe('BottomSheet', () => {
  async function renderSheet(visible = true) {
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <BottomSheet
          visible={visible}
          title="Elige la duración"
          closeAccessibilityLabel="Cerrar"
          onClose={onClose}
          testID="sheet"
        >
          <Text>contenido</Text>
        </BottomSheet>
      </SafeAreaProvider>,
    );
    return onClose;
  }

  it('muestra el título como cabecera y su contenido', async () => {
    mockReduceMotion(false);
    await renderSheet();
    expect(screen.getByRole('header', { name: 'Elige la duración' })).toBeTruthy();
    expect(screen.getByText('contenido')).toBeTruthy();
    expect(screen.getByTestId('sheet').props.animationType).toBe('slide');
  });

  it('se cierra con el botón X, el fondo y el botón atrás', async () => {
    mockReduceMotion(false);
    const onClose = await renderSheet();
    // La hoja es modal: el lector de pantalla solo alcanza la X; el fondo queda fuera de su árbol.
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    const all = screen.getAllByRole('button', { name: 'Cerrar', includeHiddenElements: true });
    expect(all).toHaveLength(2);
    await fireEvent.press(all[0]!);
    await fireEvent(screen.getByTestId('sheet'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('sin animación cuando el sistema pide reducir movimiento', async () => {
    mockReduceMotion(true);
    await renderSheet();
    await waitFor(() => expect(screen.getByTestId('sheet').props.animationType).toBe('none'));
  });

  it('oculto no renderiza el contenido', async () => {
    mockReduceMotion(false);
    await renderSheet(false);
    expect(screen.queryByText('contenido')).toBeNull();
  });
});

describe('Stepper', () => {
  it('expone el progreso y rellena los pasos completados', async () => {
    await render(<Stepper current={2} total={4} accessibilityLabel="Paso 2 de 4" testID="step" />);
    const bar = screen.getByRole('progressbar', { name: 'Paso 2 de 4' });
    expect(bar).toHaveAccessibilityValue({ min: 1, max: 4, now: 2 });
    expect(screen.getByTestId('step-segment-1')).toHaveStyle({ backgroundColor: colors.primary });
    expect(screen.getByTestId('step-segment-2')).not.toHaveStyle({
      backgroundColor: colors.primary,
    });
  });

  it('acota un paso fuera de rango', async () => {
    await render(<Stepper current={9} total={4} accessibilityLabel="Paso" />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 4 });
  });
});

describe('CircleCard', () => {
  const base: CircleCardProps = {
    totalAmount: 'S/ 24,000',
    installmentAmount: 'S/ 2,000',
    installmentPeriod: '/mes',
    months: 12,
    startLabel: 'nov. 2024',
    endLabel: 'oct. 2025',
    durationLabel: '12 meses',
    feesLabel: 'Admin Fees:',
    feesAmount: 'S/ 2,880',
    testID: 'circle',
  };

  it('muestra montos, fechas y un segmento por mes', async () => {
    await render(<CircleCard {...base} />);
    expect(screen.getByText('S/ 24,000')).toBeTruthy();
    expect(screen.getByText('12 meses')).toBeTruthy();
    expect(screen.getByText('S/ 2,880')).toBeTruthy();
    expect(screen.getByTestId('circle-month-11', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('circle-month-12', { includeHiddenElements: true })).toBeNull();
  });

  it('marca el mes de payout con su etiqueta', async () => {
    await render(<CircleCard {...base} turnIndex={2} turnLabel="Your Turn" />);
    expect(screen.getByText('Your Turn')).toBeTruthy();
    expect(screen.getByTestId('circle-month-2', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: colors.primary300,
    });
  });

  it('ignora un turno fuera del rango de meses', async () => {
    await render(<CircleCard {...base} turnIndex={12} turnLabel="Your Turn" />);
    expect(screen.queryByText('Your Turn')).toBeNull();
  });

  it('la acción tiene prioridad sobre el badge', async () => {
    const onPress = jest.fn();
    await render(<CircleCard {...base} badge="Joined" action={{ label: 'Join now', onPress }} />);
    expect(screen.queryByText('Joined')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Join now' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('sin acción muestra el badge', async () => {
    await render(<CircleCard {...base} badge="Joined" />);
    expect(screen.getByText('Joined')).toBeTruthy();
  });
});
