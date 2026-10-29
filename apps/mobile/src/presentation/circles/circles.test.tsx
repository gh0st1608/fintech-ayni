import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { myCircle } from '@test/fakes/myCircles';
import { colors } from '@/presentation/theme/tokens';
import { renderWithProviders } from '@test/renderWithProviders';

import { CirclesScreen } from './screens/CirclesScreen';

async function renderCircles(
  circleMembership = new InMemoryCircleMembershipRepository({ latencyMs: 0 }),
) {
  const onJoin = jest.fn();
  const view = await renderWithProviders(
    <CirclesScreen onJoin={onJoin} />,
    createTestContainer({ circleMembership }),
  );
  return { ...view, onJoin, circleMembership };
}

/** Un círculo activo para cualquier fecha de la prueba, lejos en el futuro. */
const future = (circleId: string) =>
  myCircle({ circleId, startsOn: '2090-01', endsOn: '2090-06', payoutPeriod: '2090-03' });
const finished = myCircle({
  circleId: 'terminado',
  startsOn: '2020-01',
  endsOn: '2020-06',
  payoutPeriod: '2020-03',
});

describe('CirclesScreen', () => {
  it('abre en Active con la tarjeta "Unido": monto, cuota, turno, fechas y Admin Fees', async () => {
    await renderCircles(
      new InMemoryCircleMembershipRepository({ latencyMs: 0, circles: [future('c-1'), finished] }),
    );
    expect(screen.getByRole('tab', { name: 'Activos', selected: true })).toBeTruthy();

    const card = await screen.findByTestId('my-circle-c-1');
    expect(card).toHaveTextContent(/30\.?000/);
    expect(card).toHaveTextContent(/5\.?600.* \/mes/);
    expect(card).toHaveTextContent(/Unido/);
    expect(card).toHaveTextContent(/Tu turno · mar\.? 2090/i);
    expect(card).toHaveTextContent(/ene\.? 2090.*6 meses.*jun\.? 2090/i);
    expect(card).toHaveTextContent(/Admin Fees: .*1\.?800/);
    // La línea de meses es decorativa (oculta al lector de pantalla): el turno 3 es el tercer mes.
    expect(
      screen.getByTestId('my-circle-c-1-month-2', { includeHiddenElements: true }),
    ).toHaveStyle({ backgroundColor: colors.primary300 });
    expect(screen.queryByTestId('my-circle-terminado')).toBeNull();
  });

  it('Finished muestra los finalizados', async () => {
    await renderCircles(
      new InMemoryCircleMembershipRepository({ latencyMs: 0, circles: [future('c-1'), finished] }),
    );
    await screen.findByTestId('my-circle-c-1');
    await fireEvent.press(screen.getByRole('tab', { name: 'Finalizados' }));

    expect(await screen.findByTestId('my-circle-terminado')).toBeTruthy();
    expect(screen.queryByTestId('my-circle-c-1')).toBeNull();
  });

  it('sin círculos muestra los estados vacíos; el de Active lleva a unirse', async () => {
    const { onJoin } = await renderCircles();
    expect(await screen.findByText('¡Tus círculos activos aparecerán aquí!')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unirme a un círculo' }));
    expect(onJoin).toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('tab', { name: 'Finalizados' }));
    expect(await screen.findByText('Todavía no tienes círculos finalizados.')).toBeTruthy();
  });

  it('carga la página siguiente al llegar al final de la lista', async () => {
    const circleMembership = new InMemoryCircleMembershipRepository({
      latencyMs: 0,
      pageSize: 2,
      circles: [future('a'), future('b'), future('c')],
    });
    const listMine = jest.spyOn(circleMembership, 'listMine');
    await renderCircles(circleMembership);
    await screen.findByTestId('my-circle-b');
    expect(screen.queryByTestId('my-circle-c')).toBeNull();

    await fireEvent(screen.getByTestId('my-circles-list'), 'onEndReached');
    expect(await screen.findByTestId('my-circle-c')).toBeTruthy();
    expect(listMine.mock.calls.map(([, cursor]) => cursor)).toEqual([null, '2']);
  });

  it('sin conexión y sin datos muestra un error recuperable', async () => {
    const circleMembership = new InMemoryCircleMembershipRepository({
      latencyMs: 0,
      circles: [future('c-1')],
    });
    const original = circleMembership.listMine.bind(circleMembership);
    let online = false;
    jest
      .spyOn(circleMembership, 'listMine')
      .mockImplementation((...args) =>
        online ? original(...args) : Promise.reject(new AppError('network', 'offline')),
      );
    await renderCircles(circleMembership);

    // La query reintenta dos veces los fallos transitorios (1 s y 2 s) antes de mostrar el error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(
      /No hay conexión/,
    );
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('my-circle-c-1')).toBeTruthy();
  }, 10_000);

  it('si una actualización falla, conserva los datos con un aviso', async () => {
    const circleMembership = new InMemoryCircleMembershipRepository({
      latencyMs: 0,
      circles: [future('c-1')],
    });
    const view = await renderCircles(circleMembership);
    await screen.findByTestId('my-circle-c-1');

    jest.spyOn(circleMembership, 'listMine').mockRejectedValue(new AppError('network', 'offline'));
    await view.queryClient.refetchQueries({ queryKey: ['circles', 'mine', 'active'] });

    await waitFor(
      () => expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos actualizar/),
      { timeout: 6000 },
    );
    expect(screen.getByTestId('my-circle-c-1')).toBeTruthy();
  }, 10_000);
});
