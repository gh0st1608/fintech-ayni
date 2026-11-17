import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { HomeContent, HomeItem } from '@/domain/home/HomeContent';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import {
  HomeContentApiRepository,
  InMemoryHomeContentRepository,
} from '@/infrastructure/home/HomeContentApiRepository';
import { HomeScreen } from '@/presentation/home/screens/HomeScreen';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

const item = (overrides: Partial<HomeItem> = {}): HomeItem => ({
  id: 'i-1',
  title: 'Ahorro',
  subtitle: 'Gana cashback al ahorrar',
  illustration: 'piggyBank',
  background: 'primary',
  target: 'savingsPlans',
  targetAmount: null,
  ...overrides,
});

const content = (overrides: Partial<HomeContent> = {}): HomeContent => ({
  offers: [],
  goals: [],
  ...overrides,
});

function setup(value: HomeContent) {
  const homeContent = new InMemoryHomeContentRepository(value);
  return { ...createTestContainer({ homeContent }), homeContent };
}

/** La ruta resuelve los destinos; aquí se espían. */
function renderHome(value: HomeContent) {
  const open = { savingsPlans: jest.fn(), referral: jest.fn(), help: jest.fn() };
  const onJoinCircle = jest.fn();
  const onJoin = jest.fn();
  return renderWithProviders(
    <HomeScreen onJoinCircle={onJoinCircle} onJoin={onJoin} onOpenContent={open} />,
    setup(value),
  ).then((view) => ({ ...view, open, onJoinCircle, onJoin }));
}

/** Ofertas y metas populares de Home (COPAYNI-25). */
describe('contenido de Home', () => {
  it('sin contenido cargado, las secciones no aparecen', async () => {
    await renderHome(content());
    await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy());
    expect(screen.queryByTestId('home-offers')).toBeNull();
    expect(screen.queryByTestId('home-goals')).toBeNull();
  });

  it('muestra las metas con su título y su subtítulo', async () => {
    await renderHome(
      content({
        goals: [item(), item({ id: 'i-2', title: 'Fiestas Patrias', subtitle: 'Arma tu junta' })],
      }),
    );

    expect(await screen.findByText('Metas populares')).toBeTruthy();
    expect(screen.getByText('Ahorro')).toBeTruthy();
    expect(screen.getByText('Gana cashback al ahorrar')).toBeTruthy();
    expect(screen.getByText('Fiestas Patrias')).toBeTruthy();
  });

  it('una meta sin subtítulo se muestra igual, como en el diseño', async () => {
    await renderHome(content({ goals: [item({ title: 'Verano', subtitle: null })] }));
    expect(await screen.findByText('Verano')).toBeTruthy();
  });

  it('al tocar una meta se abre su destino', async () => {
    const { open } = await renderHome(content({ goals: [item()] }));

    fireEvent.press(await screen.findByTestId('home-goal-i-1'));
    expect(open.savingsPlans).toHaveBeenCalled();
  });

  it('una meta que lleva a unirse precarga su monto', async () => {
    const { onJoinCircle, onJoin } = await renderHome(
      content({ goals: [item({ target: 'joinCircle', targetAmount: 300_000 })] }),
    );

    fireEvent.press(await screen.findByTestId('home-goal-i-1'));
    expect(onJoinCircle).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 300_000, currency: 'PEN' }),
    );
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('sin monto, unirse empieza por elegir el servicio', async () => {
    const { onJoin, onJoinCircle } = await renderHome(
      content({ goals: [item({ target: 'joinCircle', targetAmount: null })] }),
    );

    fireEvent.press(await screen.findByTestId('home-goal-i-1'));
    expect(onJoin).toHaveBeenCalled();
    expect(onJoinCircle).not.toHaveBeenCalled();
  });

  it('una tarjeta informativa no se puede pulsar', async () => {
    const { open } = await renderHome(content({ goals: [item({ target: 'none' })] }));

    fireEvent.press(await screen.findByTestId('home-goal-i-1'));
    expect(open.savingsPlans).not.toHaveBeenCalled();
  });

  it('el carrusel de ofertas muestra la página actual cuando hay más de una', async () => {
    await renderHome(
      content({
        offers: [
          item({ id: 'o-1', title: 'Nuevas ofertas', background: 'cream' }),
          item({ id: 'o-2', title: 'Refiere y gana', background: 'blush' }),
        ],
      }),
    );

    expect(await screen.findByTestId('home-offers')).toBeTruthy();
    expect(screen.getByLabelText('Oferta 1 de 2')).toBeTruthy();
  });
});

/** El adaptador HTTP: lo que no se entiende se omite en vez de romper Home. */
describe('HomeContentApiRepository', () => {
  const response = (data: unknown) =>
    new Response(JSON.stringify({ success: true, data, traceId: 't' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  function client(data: unknown) {
    const calls: string[] = [];
    const fetchFn = jest.fn((...[url]: Parameters<typeof fetch>) => {
      calls.push(url instanceof URL ? url.href : typeof url === 'string' ? url : url.url);
      return Promise.resolve(response(data));
    }) as unknown as typeof fetch;
    return {
      calls,
      repository: new HomeContentApiRepository(
        new FetchHttpClient({
          baseUrl: 'https://api.test/v1',
          timeoutMs: 5_000,
          fetchImpl: fetchFn,
        }),
      ),
    };
  }

  const dto = {
    id: 'g-1',
    title: 'Ahorro',
    subtitle: null,
    illustration: 'piggy-bank',
    background: 'primary',
    target: 'savings_plans',
    targetAmount: null,
  };

  it('pide el contenido en el idioma de la app y traduce los nombres del backend', async () => {
    const { repository, calls } = client({ offers: [], goals: [dto] });
    const value = await repository.get('es');

    expect(calls[0]).toContain('/home/content?lang=es');
    expect(value.goals[0]).toMatchObject({ illustration: 'piggyBank', target: 'savingsPlans' });
  });

  it('omite una tarjeta cuyo destino o ilustración no conoce esta versión', async () => {
    const { repository } = client({
      offers: [{ ...dto, id: 'o-1', target: 'nuevo_destino' }],
      goals: [{ ...dto, id: 'g-2', illustration: 'nueva-ilustracion' }],
    });
    const value = await repository.get('es');

    expect(value.offers).toEqual([]);
    expect(value.goals).toEqual([]);
  });
});
