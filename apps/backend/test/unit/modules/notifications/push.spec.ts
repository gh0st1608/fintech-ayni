import { type NotificationsPort } from '@src/modules/notifications/application/notifications.ports';
import {
  type NotificationPreferencesPort,
  type PendingPush,
  type PushDevicesPort,
  type PushResult,
  type PushSenderPort,
  type PushSettings,
} from '@src/modules/notifications/application/push.ports';
import {
  RegisterPushDeviceUseCase,
  SaveNotificationPreferencesUseCase,
  SendPendingPushUseCase,
  UnregisterPushDeviceUseCase,
} from '@src/modules/notifications/application/push.use-cases';
import { NOTIFICATION_TYPES } from '@src/modules/notifications/domain/notification';
import {
  allowsPush,
  applyPatch,
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from '@src/modules/notifications/domain/notification-preferences';
import { isExpoPushToken, type PushDevice } from '@src/modules/notifications/domain/push-device';
import { buildPushMessage, pushLanguageOf } from '@src/modules/notifications/domain/push-message';
import {
  ExpoPushSender,
  FakePushSender,
} from '@src/modules/notifications/infrastructure/expo-push-sender';
import { TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-16T15:00:00Z');
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const OTHER_TOKEN = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const device = (token = TOKEN): PushDevice => ({
  id: `dev-${token.slice(-4)}`,
  token,
  platform: 'android',
  lastSeenAt: NOW,
});

const pending = (overrides: Partial<PendingPush> = {}): PendingPush => ({
  notificationId: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  type: 'installment_due_today',
  category: 'payments',
  data: { amount: { amount: 300_000, currency: 'PEN' }, dueOn: '2026-11-16' },
  createdAt: new Date('2026-11-16T14:00:00Z'),
  language: 'es',
  ...overrides,
});

const SETTINGS: PushSettings = { maxAgeHours: 12, batchSize: 50, maxAttempts: 3, maxBatches: 10 };

function setup(options: {
  pending?: PendingPush[];
  /** Una entrada por tanda, para probar que la corrida vacía la cola. */
  batches?: PendingPush[][];
  devices?: PushDevice[];
  preferences?: NotificationPreferences;
  results?: (sent: readonly { device: PushDevice }[]) => PushResult[];
}) {
  const queue = options.batches ? [...options.batches] : undefined;
  const notifications = {
    pendingPush: jest.fn(() =>
      Promise.resolve(queue ? (queue.shift() ?? []) : (options.pending ?? [])),
    ),
    markPushed: jest.fn(() => Promise.resolve(0)),
    markPushAttempt: jest.fn(() => Promise.resolve(0)),
  } as unknown as NotificationsPort;
  const devices = {
    activeOf: jest.fn(() => Promise.resolve(options.devices ?? [device()])),
    disable: jest.fn(() => Promise.resolve(true)),
    register: jest.fn(),
  } as unknown as PushDevicesPort;
  const preferences = {
    of: jest.fn(() => Promise.resolve(options.preferences ?? DEFAULT_PREFERENCES)),
    save: jest.fn(() => Promise.resolve()),
  } as unknown as NotificationPreferencesPort;
  const sender: PushSenderPort = {
    send: jest.fn((messages) =>
      Promise.resolve(
        options.results?.(messages) ??
          messages.map(({ device: target }) => ({ token: target.token, status: 'sent' as const })),
      ),
    ),
  };
  const useCase = new SendPendingPushUseCase(
    notifications,
    devices,
    preferences,
    sender,
    SETTINGS,
    new TestClock(NOW),
  );
  return { useCase, notifications, devices, preferences, sender };
}

describe('texto del aviso', () => {
  it('cada tipo de notificación tiene título y cuerpo en los dos idiomas', () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const language of ['es', 'en'] as const) {
        const message = buildPushMessage(
          {
            id: 'n1',
            type,
            data: {
              amount: { amount: 300_000, currency: 'PEN' },
              dueOn: '2026-11-20',
              period: '2026-11',
              documentType: 'national_id',
            },
          },
          language,
        );
        expect(message.title.length).toBeGreaterThan(0);
        expect(message.body.length).toBeGreaterThan(0);
        // Nada de plantillas sin reemplazar.
        expect(`${message.title} ${message.body}`).not.toMatch(/\{\{|undefined|NaN/);
      }
    }
  });

  it('escribe el monto y la fecha en el idioma de la persona', () => {
    const notification = {
      id: 'n1',
      type: 'installment_due_soon' as const,
      data: { amount: { amount: 300_000, currency: 'PEN' }, dueOn: '2026-11-20' },
    };
    const es = buildPushMessage(notification, 'es');
    const en = buildPushMessage(notification, 'en');
    expect(es.body).toMatch(/3[.,]000[.,]00/);
    expect(es.body).toMatch(/nov/i);
    expect(en.body).toMatch(/Nov/);
    expect(es.body).not.toBe(en.body);
  });

  it('la fecha de vencimiento no se corre un día', () => {
    const message = buildPushMessage(
      { id: 'n1', type: 'installment_due_soon', data: { dueOn: '2026-01-01' } },
      'es',
    );
    expect(message.body).toMatch(/1 de ene|01\/01\/2026|1 ene/i);
    expect(message.body).not.toMatch(/dic|31/);
  });

  it('lleva lo mínimo para abrir la pantalla al tocar el aviso', () => {
    const message = buildPushMessage(
      {
        id: 'n1',
        type: 'payout_turn',
        data: { circleId: 'c1', amount: { amount: 1, currency: 'PEN' } },
      },
      'es',
    );
    expect(message.data).toEqual({ notificationId: 'n1', type: 'payout_turn', circleId: 'c1' });
  });

  it('un documento sin etiqueta propia usa la genérica', () => {
    const message = buildPushMessage(
      { id: 'n1', type: 'document_approved', data: { documentType: 'utility_bill' } },
      'es',
    );
    expect(message.body).toContain('documento');
  });

  it('el idioma sale del perfil y por defecto es español', () => {
    expect(pushLanguageOf('en')).toBe('en');
    expect(pushLanguageOf('en-US')).toBe('en');
    expect(pushLanguageOf('es-PE')).toBe('es');
    expect(pushLanguageOf(null)).toBe('es');
    expect(pushLanguageOf('qu')).toBe('es');
  });
});

describe('preferencias', () => {
  it('quien no las tocó recibe todo', () => {
    for (const category of ['payments', 'circles', 'account'] as const) {
      expect(allowsPush(DEFAULT_PREFERENCES, category)).toBe(true);
    }
  });

  it('el interruptor general apaga todas las categorías', () => {
    const preferences = applyPatch(DEFAULT_PREFERENCES, { pushEnabled: false });
    expect(allowsPush(preferences, 'payments')).toBe(false);
    // Las categorías no se pierden: al volver a encender siguen como estaban.
    expect(preferences.categories.payments).toBe(true);
  });

  it('un cambio parcial no toca lo que no se envía', () => {
    const preferences = applyPatch(DEFAULT_PREFERENCES, { categories: { circles: false } });
    expect(preferences.categories).toEqual({ payments: true, circles: false, account: true });
    expect(preferences.pushEnabled).toBe(true);
  });

  it('guardar devuelve cómo quedaron, sobre lo que ya tenía', async () => {
    const { preferences } = setup({
      preferences: {
        pushEnabled: true,
        categories: { payments: false, circles: true, account: true },
      },
    });
    const useCase = new SaveNotificationPreferencesUseCase(preferences, new TestClock(NOW));
    await expect(useCase.execute('user-1', { categories: { account: false } })).resolves.toEqual({
      pushEnabled: true,
      categories: { payments: false, circles: true, account: false },
    });
    expect(preferences.save).toHaveBeenCalledWith(
      'user-1',
      { pushEnabled: true, categories: { payments: false, circles: true, account: false } },
      NOW,
    );
  });
});

describe('registro del dispositivo', () => {
  it('acepta los tokens de Expo y rechaza lo demás', () => {
    expect(isExpoPushToken(TOKEN)).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('abc')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
  });

  it('no guarda un token con otro formato', async () => {
    const { devices } = setup({});
    const useCase = new RegisterPushDeviceUseCase(devices);
    await expect(
      useCase.execute({ userId: 'user-1', token: 'fcm:abc', platform: 'android' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(devices.register).not.toHaveBeenCalled();
  });

  it('al cerrar sesión apaga ese token', async () => {
    const { devices } = setup({});
    const useCase = new UnregisterPushDeviceUseCase(devices, new TestClock(NOW));
    await useCase.execute(TOKEN);
    expect(devices.disable).toHaveBeenCalledWith(TOKEN, 'signed_out', NOW);
  });
});

describe('envío de los avisos pendientes', () => {
  it('sin pendientes no pide dispositivos ni envía', async () => {
    const { useCase, devices, sender } = setup({ pending: [] });
    await expect(useCase.execute()).resolves.toEqual({
      considered: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      unregistered: 0,
    });
    expect(devices.activeOf).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('envía y lo marca enviado, para que una segunda corrida no repita el aviso', async () => {
    const item = pending();
    const { useCase, notifications, sender } = setup({ pending: [item] });
    await expect(useCase.execute()).resolves.toMatchObject({ considered: 1, sent: 1 });
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(notifications.markPushed).toHaveBeenCalledWith([item.notificationId], NOW);
  });

  it('a varios dispositivos de la misma persona, con un solo aviso entregado', async () => {
    const item = pending();
    const { useCase, notifications, sender } = setup({
      pending: [item],
      devices: [device(), device(OTHER_TOKEN)],
    });
    await expect(useCase.execute()).resolves.toMatchObject({ sent: 1 });
    expect((sender.send as jest.Mock).mock.calls[0]?.[0]).toHaveLength(2);
    expect(notifications.markPushed).toHaveBeenCalledWith([item.notificationId], NOW);
  });

  it('si un dispositivo falla pero otro recibe, el aviso cuenta como entregado', async () => {
    const { useCase, notifications } = setup({
      pending: [pending()],
      devices: [device(), device(OTHER_TOKEN)],
      results: (messages) =>
        messages.map(({ device: target }, index) => ({
          token: target.token,
          status: index === 0 ? ('failed' as const) : ('sent' as const),
        })),
    });
    await expect(useCase.execute()).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(notifications.markPushAttempt).not.toHaveBeenCalled();
  });

  it('un fallo del proveedor suma un intento y deja el aviso pendiente', async () => {
    const item = pending();
    const { useCase, notifications } = setup({
      pending: [item],
      results: (messages) =>
        messages.map(({ device: target }) => ({
          token: target.token,
          status: 'failed' as const,
          reason: 'HTTP 503',
        })),
    });
    await expect(useCase.execute()).resolves.toMatchObject({ sent: 0, failed: 1 });
    expect(notifications.markPushAttempt).toHaveBeenCalledWith([item.notificationId]);
    expect(notifications.markPushed).not.toHaveBeenCalled();
  });

  it('un token que ya no existe queda apagado', async () => {
    const { useCase, devices } = setup({
      pending: [pending()],
      results: (messages) =>
        messages.map(({ device: target }) => ({
          token: target.token,
          status: 'unregistered' as const,
        })),
    });
    await expect(useCase.execute()).resolves.toMatchObject({ unregistered: 1, sent: 0 });
    expect(devices.disable).toHaveBeenCalledWith(TOKEN, 'unregistered', NOW);
  });

  it('lo viejo no interrumpe a nadie, pero deja de estar pendiente', async () => {
    const old = pending({ createdAt: new Date('2026-11-15T15:00:00Z') });
    const { useCase, notifications, sender } = setup({ pending: [old] });
    await expect(useCase.execute()).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(sender.send).not.toHaveBeenCalled();
    expect(notifications.markPushed).toHaveBeenCalledWith([old.notificationId], NOW);
  });

  it('respeta la categoría apagada y no vuelve a intentarlo', async () => {
    const item = pending({ category: 'circles', type: 'circle_paused', data: {} });
    const { useCase, notifications, sender } = setup({
      pending: [item],
      preferences: {
        pushEnabled: true,
        categories: { payments: true, circles: false, account: true },
      },
    });
    await expect(useCase.execute()).resolves.toMatchObject({ skipped: 1 });
    expect(sender.send).not.toHaveBeenCalled();
    expect(notifications.markPushed).toHaveBeenCalledWith([item.notificationId], NOW);
  });

  it('sin dispositivos no se queda nada pendiente', async () => {
    const item = pending();
    const { useCase, notifications, sender } = setup({ pending: [item], devices: [] });
    await expect(useCase.execute()).resolves.toMatchObject({ skipped: 1 });
    expect(sender.send).not.toHaveBeenCalled();
    expect(notifications.markPushed).toHaveBeenCalledWith([item.notificationId], NOW);
  });

  it('pide dispositivos y preferencias una sola vez por persona', async () => {
    const { useCase, devices, preferences } = setup({
      pending: [
        pending({ notificationId: '11111111-1111-4111-8111-111111111111' }),
        pending({ notificationId: '22222222-2222-4222-8222-222222222222' }),
      ],
    });
    await useCase.execute();
    expect(devices.activeOf).toHaveBeenCalledTimes(1);
    expect(preferences.of).toHaveBeenCalledTimes(1);
  });

  // Con una sola tanda por corrida, el excedente esperaba al día siguiente y para entonces ya
  // habría pasado maxAgeHours: se habría descartado sin enviarse (COPAYNI-85).
  it('sigue pidiendo tandas hasta vaciar la cola', async () => {
    const llena = Array.from({ length: SETTINGS.batchSize }, (_, index) =>
      pending({ notificationId: `n${index}` }),
    );
    const { useCase, notifications } = setup({
      batches: [llena, [pending({ notificationId: 'ultima' })]],
    });

    const run = await useCase.execute();

    expect(notifications.pendingPush).toHaveBeenCalledTimes(2);
    expect(run.considered).toBe(SETTINGS.batchSize + 1);
    expect(run.sent).toBe(SETTINGS.batchSize + 1);
  });

  it('para al llegar al tope de tandas, aunque la cola no avance', async () => {
    const llena = Array.from({ length: SETTINGS.batchSize }, (_, index) =>
      pending({ notificationId: `n${index}` }),
    );
    // Siempre devuelve una tanda llena: sin tope, la corrida no terminaría nunca.
    const { useCase, notifications } = setup({ pending: llena });

    const run = await useCase.execute();

    expect(notifications.pendingPush).toHaveBeenCalledTimes(SETTINGS.maxBatches);
    expect(run.considered).toBe(SETTINGS.batchSize * SETTINGS.maxBatches);
  });
});

describe('Expo Push Service', () => {
  type Reply = { status: number; body: unknown } | Error;

  function sender(replies: Reply[], accessToken?: string) {
    const calls: { url: string; init: RequestInit }[] = [];
    const http = jest.fn((...[url, init]: Parameters<typeof fetch>) => {
      calls.push({
        url: url instanceof URL ? url.href : typeof url === 'string' ? url : url.url,
        init: init ?? {},
      });
      const reply = replies.shift() ?? { status: 500, body: {} };
      if (reply instanceof Error) return Promise.reject(reply);
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body),
      } as Response);
    }) as unknown as typeof fetch;
    return {
      calls,
      http,
      expo: new ExpoPushSender(
        { apiUrl: 'https://exp.host/--/api/v2/push/send', accessToken, timeoutMs: 5_000 },
        http,
      ),
    };
  }

  const message = (id = 'n1') => ({
    device: device(),
    message: {
      title: 'Hoy vence tu cuota',
      body: 'Paga S/ 3.000,00 hoy.',
      data: { notificationId: id, type: 'installment_due_today' as const },
    },
  });

  it('manda el aviso con el token, el canal y la prioridad', async () => {
    const { expo, calls } = sender([{ status: 200, body: { data: [{ status: 'ok', id: 't1' }] } }]);
    await expect(expo.send([message()])).resolves.toEqual([{ token: TOKEN, status: 'sent' }]);
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>[];
    expect(body[0]).toMatchObject({
      to: TOKEN,
      title: 'Hoy vence tu cuota',
      channelId: 'default',
      priority: 'high',
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('con token de acceso lo envía en la cabecera', async () => {
    const { expo, calls } = sender(
      [{ status: 200, body: { data: [{ status: 'ok' }] } }],
      'secreto',
    );
    await expo.send([message()]);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer secreto');
  });

  it('traduce DeviceNotRegistered para poder apagar el token', async () => {
    const { expo } = sender([
      {
        status: 200,
        body: {
          data: [{ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }],
        },
      },
    ]);
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'unregistered' },
    ]);
  });

  it('cualquier otro error del ticket es un fallo con su motivo', async () => {
    const { expo } = sender([
      {
        status: 200,
        body: { data: [{ status: 'error', message: 'roto', details: { error: 'MessageTooBig' } }] },
      },
    ]);
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'MessageTooBig' },
    ]);
  });

  it('un error de la petición completa falla toda la tanda', async () => {
    const { expo } = sender([
      { status: 200, body: { errors: [{ message: 'Invalid credentials' }] } },
    ]);
    await expect(expo.send([message(), message('n2')])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'Invalid credentials' },
      { token: TOKEN, status: 'failed', reason: 'Invalid credentials' },
    ]);
  });

  it('si la red falla, nada queda como enviado', async () => {
    const { expo } = sender([new Error('socket hang up')]);
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'socket hang up' },
    ]);
  });

  it('un HTTP de error deja la tanda para el próximo intento', async () => {
    const { expo } = sender([{ status: 503, body: {} }]);
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'HTTP 503' },
    ]);
  });

  it('si la respuesta no se puede leer, la tanda queda para el próximo intento', async () => {
    const http = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Unexpected end of JSON input')),
      } as unknown as Response),
    ) as unknown as typeof fetch;
    const expo = new ExpoPushSender(
      { apiUrl: 'https://exp.host/--/api/v2/push/send', timeoutMs: 5_000 },
      http,
    );
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'Unexpected end of JSON input' },
    ]);
  });

  it('un ticket que no llegó se cuenta como fallo, no como enviado', async () => {
    const { expo } = sender([{ status: 200, body: { data: [] } }]);
    await expect(expo.send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'failed', reason: 'sin ticket' },
    ]);
  });

  it('parte en tandas de 100, el tope del proveedor', async () => {
    const ok = (count: number) => ({
      status: 200,
      body: { data: Array.from({ length: count }, () => ({ status: 'ok' })) },
    });
    const { expo, calls } = sender([ok(100), ok(20)]);
    const messages = Array.from({ length: 120 }, (_, index) => message(`n${index}`));
    const results = await expo.send(messages);
    expect(results).toHaveLength(120);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]!.init.body as string)).toHaveLength(100);
    expect(JSON.parse(calls[1]!.init.body as string)).toHaveLength(20);
  });

  it('el doble de desarrollo acepta todo sin salir a la red', async () => {
    await expect(new FakePushSender().send([message()])).resolves.toEqual([
      { token: TOKEN, status: 'sent' },
    ]);
  });
});
