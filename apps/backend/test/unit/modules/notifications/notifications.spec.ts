import { type NotificationsPort } from '@src/modules/notifications/application/notifications.ports';
import {
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  SyncNotificationsUseCase,
} from '@src/modules/notifications/application/notifications.use-cases';
import { CATEGORY_OF, NOTIFICATION_TYPES } from '@src/modules/notifications/domain/notification';
import { TestClock } from '@test/support/create-test-app';

/** 2026-11-12 a las 23:30 en Lima ya es 13 en UTC: "hoy" sale de la zona del negocio. */
const NOW = new Date('2026-11-13T04:30:00Z');

function setup() {
  const port = {
    project: jest.fn<
      ReturnType<NotificationsPort['project']>,
      Parameters<NotificationsPort['project']>
    >(() => Promise.resolve(2)),
    list: jest.fn<ReturnType<NotificationsPort['list']>, Parameters<NotificationsPort['list']>>(
      () => Promise.resolve({ items: [], nextCursor: null }),
    ),
    unreadCount: jest.fn<ReturnType<NotificationsPort['unreadCount']>, [string]>(() =>
      Promise.resolve(4),
    ),
    markRead: jest.fn<
      ReturnType<NotificationsPort['markRead']>,
      Parameters<NotificationsPort['markRead']>
    >(() => Promise.resolve(1)),
  } satisfies NotificationsPort;
  const clock = new TestClock(NOW);
  const sync = new SyncNotificationsUseCase(
    port,
    { dueSoonDays: 3, timeZone: 'America/Lima' },
    clock,
  );
  return {
    port,
    sync,
    list: new ListNotificationsUseCase(port, sync),
    mark: new MarkNotificationsReadUseCase(port, clock),
  };
}

describe('notificaciones', () => {
  it('cada tipo tiene su pestaña', () => {
    for (const type of NOTIFICATION_TYPES) expect(CATEGORY_OF[type]).toBeDefined();
  });

  it('la sincronización usa la fecha del negocio y los días de aviso', async () => {
    const { sync, port } = setup();
    await expect(sync.execute()).resolves.toBe(2);
    expect(port.project).toHaveBeenCalledWith({
      userId: undefined,
      today: '2026-11-12',
      dueSoonDays: 3,
    });
  });

  it('la bandeja sincroniza solo a la persona antes de leer', async () => {
    const { list, port } = setup();
    const page = await list.execute('u1', { limit: 20, cursor: null, category: 'payments' });
    expect(page).toEqual({ items: [], nextCursor: null, unread: 4 });
    expect(port.project).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(port.list).toHaveBeenCalledWith('u1', {
      limit: 20,
      cursor: null,
      category: 'payments',
    });
  });

  it('marca como leídas las indicadas o todas, y valida los ids', async () => {
    const { mark, port } = setup();
    const id = '6f1c2a5e-0000-4000-8000-000000000001';
    await expect(mark.execute('u1', [id])).resolves.toEqual({ unread: 4 });
    expect(port.markRead).toHaveBeenCalledWith('u1', [id], NOW);
    await mark.execute('u1', null);
    expect(port.markRead).toHaveBeenLastCalledWith('u1', null, NOW);
    await expect(mark.execute('u1', [])).rejects.toMatchObject({ details: { ids: 'invalid' } });
    await expect(mark.execute('u1', ['x'])).rejects.toMatchObject({ details: { ids: 'invalid' } });
  });
});
