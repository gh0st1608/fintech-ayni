import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { recommendedCircle } from '@test/fakes/myCircles';
import { renderWithProviders } from '@test/renderWithProviders';

import { HomeScreen } from './screens/HomeScreen';

async function renderHome(circleQuote = new InMemoryCircleQuoteRepository({ latencyMs: 0 })) {
  const handlers = { onJoinCircle: jest.fn(), onJoin: jest.fn() };
  const view = await renderWithProviders(
    <HomeScreen {...handlers} />,
    createTestContainer({ circleQuote }),
  );
  return { ...view, ...handlers, circleQuote };
}

const withRecommended = (...ids: string[]) =>
  new InMemoryCircleQuoteRepository({
    latencyMs: 0,
    recommended: ids.map((circleId) => recommendedCircle({ circleId })),
  });

describe('HomeScreen', () => {
  it('el banner de invitación muestra el beneficio y abre "Invita a un amigo"', async () => {
    const onOpenReferral = jest.fn();
    await renderWithProviders(
      <HomeScreen onJoinCircle={jest.fn()} onJoin={jest.fn()} onOpenReferral={onOpenReferral} />,
    );
    const banner = await screen.findByTestId('home-referral-banner');
    expect(banner).toHaveTextContent(/ambos tendrán .*150.* de descuento/);
    await fireEvent.press(banner);
    expect(onOpenReferral).toHaveBeenCalled();
  });

  it('sin acceso a referidos no muestra el banner', async () => {
    await renderHome(withRecommended('r-1'));
    await screen.findByTestId('recommended-r-1');
    expect(screen.queryByTestId('home-referral-banner')).toBeNull();
  });

  it('muestra los recomendados con monto, cuota base, fechas, duración y Admin Fees', async () => {
    await renderHome(withRecommended('r-1', 'r-2'));
    expect(screen.getByRole('header', { name: 'Recomendados para ti' })).toBeTruthy();

    const card = await screen.findByTestId('recommended-r-1');
    expect(card).toHaveTextContent(/30\.?000/);
    expect(card).toHaveTextContent(/3\.?000.* \/mes/);
    expect(card).toHaveTextContent(/nov\.? 2026.*10 meses.*ago\.? 2027/i);
    expect(card).toHaveTextContent(/Admin Fees: .*3\.?600/);
    expect(screen.getByTestId('recommended-r-2')).toBeTruthy();
  });

  it('"Únete ahora" entra al flujo con el payout del círculo', async () => {
    const { onJoinCircle } = await renderHome(withRecommended('r-1'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Únete ahora' }));
    expect(onJoinCircle).toHaveBeenCalledWith(recommendedCircle().payout);
  });

  it('mientras carga muestra un skeleton', async () => {
    await renderHome(
      new InMemoryCircleQuoteRepository({ latencyMs: 50, recommended: [recommendedCircle()] }),
    );
    expect(screen.getByTestId('recommended-skeleton')).toBeTruthy();
    expect(await screen.findByTestId('recommended-r-1')).toBeTruthy();
    expect(screen.queryByTestId('recommended-skeleton')).toBeNull();
  });

  it('sin recomendados oculta la sección y ofrece unirse a un círculo nuevo', async () => {
    const { onJoin } = await renderHome();
    expect(await screen.findByTestId('home-empty')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Recomendados para ti' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: "Unirme a un Game'ya" }));
    expect(onJoin).toHaveBeenCalled();
  });

  it('un error muestra el motivo con reintento', async () => {
    const circleQuote = withRecommended('r-1');
    const original = circleQuote.listRecommended.bind(circleQuote);
    let online = false;
    jest
      .spyOn(circleQuote, 'listRecommended')
      .mockImplementation((signal) =>
        online ? original(signal) : Promise.reject(new AppError('network', 'offline')),
      );
    await renderHome(circleQuote);

    // La query reintenta dos veces los fallos transitorios (1 s y 2 s) antes de mostrar el error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent(
      /No hay conexión/,
    );
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('recommended-r-1')).toBeTruthy();
  }, 10_000);

  it('si una actualización falla, conserva los recomendados con un aviso', async () => {
    const circleQuote = withRecommended('r-1');
    const view = await renderHome(circleQuote);
    await screen.findByTestId('recommended-r-1');

    jest
      .spyOn(circleQuote, 'listRecommended')
      .mockRejectedValue(new AppError('network', 'offline'));
    await view.queryClient.refetchQueries({ queryKey: ['circles', 'recommended'] });

    await waitFor(
      () =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          /No pudimos actualizar los recomendados/,
        ),
      { timeout: 6000 },
    );
    expect(screen.getByTestId('recommended-r-1')).toBeTruthy();
  }, 10_000);
});
