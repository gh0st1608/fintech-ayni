import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { type AppNotification, targetOf } from '@/domain/notifications/Notification';
import { Money } from '@/domain/shared/value-objects/Money';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { InMemoryNotificationRepository } from '@/infrastructure/notifications/InMemoryNotificationRepository';
import { NotificationApiRepository } from '@/infrastructure/notifications/NotificationApiRepository';
import { HomeScreen } from '@/presentation/home/screens/HomeScreen';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { NotificationsScreen } from './NotificationsScreen';

const NOW = new Date(2026, 10, 12, 18, 0);

const notification = (overrides: Partial<AppNotification>): AppNotification => ({
  id: 'n-1',
  type: 'installmentDueSoon',
  category: 'payments',
  circleId: 'c-1',
  amount: Money.fromMajor(560, 'PEN'),
  dueOn: '2026-12-01',
  period: null,
  documentType: null,
  occurredAt: new Date(2026, 10, 12, 9, 30),
  read: false,
  ...overrides,
});

const ITEMS = [
  notification({}),
  notification({
    id: 'n-2',
    type: 'payoutTurn',
    amount: Money.fromMajor(24_000, 'PEN'),
    dueOn: null,
    period: '2026-11',
    occurredAt: new Date(2026, 10, 12, 8, 0),
  }),
  notification({
    id: 'n-3',
    type: 'documentApproved',
    category: 'account',
    circleId: null,
    amount: null,
    dueOn: null,
    documentType: 'national_id',
    occurredAt: new Date(2026, 10, 9, 10, 0),
    read: true,
  }),
  notification({
    id: 'n-4',
    type: 'circleMemberJoined',
    category: 'circles',
    amount: null,
    dueOn: null,
    occurredAt: new Date(2026, 9, 1, 10, 0),
    read: true,
  }),
];

function setup(items = ITEMS) {
  const notifications = new InMemoryNotificationRepository('PEN', { latencyMs: 0, items });
  return { notifications, container: createTestContainer({ notifications }) };
}

describe('Notification', () => {
  it('lleva a los pagos, a la junta o a los documentos', () => {
    expect(targetOf(ITEMS[0]!)).toEqual({ screen: 'paymentHistory' });
    expect(targetOf(ITEMS[1]!)).toEqual({ screen: 'circle', circleId: 'c-1' });
    expect(targetOf(ITEMS[2]!)).toEqual({ screen: 'documents' });
    expect(targetOf(ITEMS[3]!)).toEqual({ screen: 'circle', circleId: 'c-1' });
  });
});

describe('NotificationApiRepository', () => {
  function api(body: unknown) {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const http = new FetchHttpClient({
      baseUrl: 'https://api.test/v1',
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { fetchImpl, repository: new NotificationApiRepository(http) };
  }

  it('lee la bandeja por pestaña y omite los tipos que no conoce', async () => {
    const { fetchImpl, repository } = api({
      items: [
        {
          id: 'a',
          type: 'installment_due_soon',
          category: 'payments',
          data: {
            circleId: 'c-1',
            amount: { amount: 56000, currency: 'PEN' },
            dueOn: '2026-12-01',
          },
          occurredAt: '2026-11-12T14:30:00.000Z',
          read: false,
        },
        {
          id: 'b',
          type: 'futuro',
          category: 'payments',
          data: {},
          occurredAt: '2026-11-12T14:30:00.000Z',
          read: false,
        },
      ],
      nextCursor: 'xyz',
      unread: 2,
    });
    const page = await repository.list({ tab: 'payments', cursor: 'abc' });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://api.test/v1/me/notifications?category=payments&cursor=abc',
    );
    expect(page).toMatchObject({
      nextCursor: 'xyz',
      unread: 2,
      items: [{ id: 'a', type: 'installmentDueSoon', dueOn: '2026-12-01', read: false }],
    });
    expect(page.items).toHaveLength(1);
  });

  it('marca como leídas con POST y devuelve las no leídas', async () => {
    const { fetchImpl, repository } = api({ unread: 0 });
    await expect(repository.markRead(null)).resolves.toBe(0);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/v1/me/notifications/read');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({});
  });
});

describe('NotificationsScreen', () => {
  it('agrupa por fecha, arma los textos y filtra por pestaña', async () => {
    const { container } = setup();
    await renderWithProviders(
      <NotificationsScreen onOpen={jest.fn()} now={() => NOW} />,
      container,
    );

    expect(await screen.findByText('Tu cuota vence pronto')).toBeOnTheScreen();
    expect(screen.getByText('Hoy')).toBeOnTheScreen();
    expect(screen.getByText('Esta semana')).toBeOnTheScreen();
    expect(screen.getByText('Anteriores')).toBeOnTheScreen();
    expect(screen.getByText('¡Este mes cobras!')).toBeOnTheScreen();
    expect(screen.getByText('Verificamos tu DNI.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('tab', { name: 'Círculos' }));
    await waitFor(() => expect(screen.queryByText('Tu cuota vence pronto')).toBeNull());
    expect(screen.getByText('Nuevo miembro en tu junta')).toBeOnTheScreen();
  });

  it('al tocar una, queda leída y abre su pantalla', async () => {
    const { container, notifications } = setup();
    const onOpen = jest.fn();
    await renderWithProviders(<NotificationsScreen onOpen={onOpen} now={() => NOW} />, container);

    fireEvent.press(await screen.findByTestId('notification-n-2'));
    expect(onOpen).toHaveBeenCalledWith({ screen: 'circle', circleId: 'c-1' });
    await waitFor(() =>
      expect(notifications.items.find((item) => item.id === 'n-2')?.read).toBe(true),
    );
  });

  it('marca todas como leídas; sin notificaciones muestra el vacío', async () => {
    const { container, notifications } = setup();
    await renderWithProviders(
      <NotificationsScreen onOpen={jest.fn()} now={() => NOW} />,
      container,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));
    await waitFor(() => expect(notifications.items.every((item) => item.read)).toBe(true));

    await renderWithProviders(
      <NotificationsScreen onOpen={jest.fn()} now={() => NOW} />,
      setup([]).container,
    );
    expect(await screen.findByTestId('notifications-empty')).toBeOnTheScreen();
  });
});

describe('campana de Home', () => {
  it('muestra un punto si hay no leídas y abre la bandeja', async () => {
    const onOpenNotifications = jest.fn();
    await renderWithProviders(
      <HomeScreen
        onJoinCircle={jest.fn()}
        onJoin={jest.fn()}
        onOpenNotifications={onOpenNotifications}
      />,
      setup().container,
    );
    const bell = await screen.findByRole('button', { name: 'Notificaciones, tienes 2 sin leer' });
    expect(within(bell).getByTestId('notification-dot')).toBeOnTheScreen();
    fireEvent.press(bell);
    expect(onOpenNotifications).toHaveBeenCalled();
  });

  it('sin no leídas no muestra el punto', async () => {
    await renderWithProviders(
      <HomeScreen onJoinCircle={jest.fn()} onJoin={jest.fn()} onOpenNotifications={jest.fn()} />,
      setup([]).container,
    );
    expect(await screen.findByRole('button', { name: 'Notificaciones' })).toBeOnTheScreen();
    expect(screen.queryByTestId('notification-dot')).toBeNull();
  });
});
