import { screen, waitFor, within } from '@testing-library/react';

import {
  AddSupportNoteUseCase,
  RevealUserContactUseCase,
  SetUserBlockedUseCase,
} from '@/application/usecases';
import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { CycleRunsApiRepository, UsersApiRepository } from '@/infrastructure/api/adapters';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { TokenStore } from '@/infrastructure/http/TokenStore';
import { InMemoryCycleRuns, InMemoryStaffAuth, InMemoryUsers, NOW, person } from '@test/fakes';
import { renderApp } from '@test/renderApp';

function signedIn(roles: StaffRole[]) {
  const auth = new InMemoryStaffAuth();
  auth.staff = {
    staffId: 'dev:soporte@ayni.local',
    email: 'soporte@ayni.local',
    roles,
    authenticatedAt: NOW,
  };
  return auth;
}

const staff = (roles: StaffRole[]) => ({
  staffId: 'dev:soporte@ayni.local',
  email: null,
  roles,
  authenticatedAt: NOW,
});

describe('acciones de soporte', () => {
  it('soporte cierra las sesiones con motivo y ve cuántas se cerraron', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['support']),
      users,
    });

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesiones' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cerrar todas las sesiones' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialog).findByText('Escribe el motivo')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Motivo'), 'Robo del teléfono');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se cerraron 2 sesiones.');
    expect(users.actions).toEqual([
      { userId: rosa.userId, action: 'revoke', reason: 'Robo del teléfono' },
    ]);
    // Soporte no revela datos.
    expect(screen.queryByRole('button', { name: 'Ver dato completo' })).not.toBeInTheDocument();
  });

  it('bloquear muestra el aviso en el perfil; desbloquear lo quita', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['operations']),
      users,
    });

    await user.click(await screen.findByRole('button', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bloquear la cuenta' });
    await user.type(within(dialog).getByLabelText('Motivo'), 'Fraude reportado');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/Motivo: Fraude reportado/)).toBeInTheDocument();
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('quedó bloqueada');

    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
    const unblock = await screen.findByRole('dialog', { name: 'Desbloquear la cuenta' });
    await user.type(within(unblock).getByLabelText('Motivo'), 'Caso resuelto');
    await user.click(within(unblock).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByText(/Motivo: Fraude/)).not.toBeInTheDocument());
  });

  it('si desbloquear pide autenticación reciente, ofrece volver a iniciar sesión', async () => {
    const rosa = person({ blocked: { at: NOW, reason: 'Fraude' } });
    const users = new InMemoryUsers([rosa]);
    jest
      .spyOn(users, 'setBlocked')
      .mockRejectedValueOnce(new AppError('step_up_required', 'Vuelve a autenticarte'));
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['super_admin']),
      users,
    });
    await user.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desbloquear la cuenta' });
    await user.type(within(dialog).getByLabelText('Motivo'), 'Resuelto');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(
      await within(dialog).findByRole('button', { name: 'Volver a iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('operaciones ve el dato completo con motivo; al cerrar deja de mostrarse', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['operations']),
      users,
    });
    await user.click(await screen.findByRole('button', { name: 'Ver dato completo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ver el dato completo' });
    await user.type(within(dialog).getByLabelText('Motivo'), 'Verificar identidad');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialog).findByText('rosa.quispe@mail.com')).toBeInTheDocument();
    expect(within(dialog).getByText('Rosa Quispe')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByText('rosa.quispe@mail.com')).not.toBeInTheDocument());
  });

  it('finanzas ve a la persona y sus notas, pero no tiene acciones ni puede escribir', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    users.noteBook[rosa.userId] = [
      {
        id: '00000000-0000-4000-9000-000000000071',
        body: 'Llamó por un cobro duplicado',
        authorId: 'dev:otra@ayni.local',
        authorEmail: null,
        createdAt: NOW,
      },
    ];
    renderApp({ path: `/users/${rosa.userId}`, auth: signedIn(['finance']), users });
    expect(await screen.findByText('Llamó por un cobro duplicado')).toBeInTheDocument();
    expect(screen.getByText(/dev:otra@ayni.local/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acciones de soporte' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nueva nota')).not.toBeInTheDocument();
  });

  it('soporte agrega una nota y aparece arriba; una nota vacía no se envía', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['support']),
      users,
    });
    expect(await screen.findByText('Todavía no hay notas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar nota' }));
    expect(await screen.findByText('Escribe la nota')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nueva nota'), 'Se derivó a finanzas');
    await user.click(screen.getByRole('button', { name: 'Agregar nota' }));
    expect(await screen.findByText('Se derivó a finanzas')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva nota')).toHaveValue('');
  });

  it('si las notas no cargan, permite reintentar', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    jest.spyOn(users, 'notes').mockRejectedValueOnce(new AppError('network', 'sin red'));
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['support']),
      users,
    });
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay notas')).toBeInTheDocument();
  });
});

describe('casos de uso de soporte', () => {
  it('exigen el rol, el motivo y una nota no vacía', () => {
    const users = new InMemoryUsers();
    expect(() =>
      new SetUserBlockedUseCase(users).execute(staff(['finance']), 'u', 'block', 'x'),
    ).toThrow('Tu rol no permite');
    expect(() => new RevealUserContactUseCase(users).execute(staff(['support']), 'u', 'x')).toThrow(
      'Tu rol no permite',
    );
    expect(() =>
      new SetUserBlockedUseCase(users).execute(staff(['support']), 'u', 'block', ' '),
    ).toThrow('Escribe el motivo');
    expect(() =>
      new SetUserBlockedUseCase(users).execute(staff(['support']), 'u', 'block', 'x'.repeat(501)),
    ).toThrow('hasta 500');
    expect(() =>
      new AddSupportNoteUseCase(users).execute(staff(['support']), 'u', 'x'.repeat(2001)),
    ).toThrow('hasta 2000');
  });

  it('los adaptadores llaman a los endpoints con el motivo y validan los contratos', async () => {
    const calls: [string, string | undefined][] = [];
    const id = '00000000-0000-4000-a000-000000000001';
    const replies: unknown[] = [
      { revokedSessions: 1 },
      { blocked: true, changed: true, revokedSessions: 1 },
      { email: 'a@b.pe', phone: null, firstName: null, lastName: null },
      { items: [] },
      {
        id: '00000000-0000-4000-9000-000000000071',
        body: 'Nota',
        authorId: 'dev:x',
        authorEmail: null,
        createdAt: '2026-11-09T15:00:00.000Z',
      },
      {
        items: [
          {
            id: '00000000-0000-4000-9000-000000000072',
            businessDate: '2026-12-01',
            startedAt: '2026-12-01T11:00:00.000Z',
            finishedAt: '2026-12-01T11:00:02.000Z',
            advanced: 3,
            locked: 0,
            failed: 0,
            failures: [],
          },
        ],
        nextCursor: null,
      },
    ];
    const fetchFn = jest.fn((url: URL | RequestInfo, init?: RequestInit) => {
      const href = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;
      calls.push([href, typeof init?.body === 'string' ? init.body : undefined]);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: replies.shift(), traceId: 't' }),
      } as Response);
    }) as unknown as typeof fetch;
    const http = new FetchHttpClient('http://api.test', new TokenStore(), 5_000, fetchFn);
    const users = new UsersApiRepository(http);
    await users.revokeSessions(id, 'Robo');
    await users.setBlocked(id, 'block', 'Fraude');
    await users.revealContact(id, 'Verificar');
    await users.notes(id);
    await users.addNote(id, 'Nota');
    const runs = await new CycleRunsApiRepository(http).list({ limit: 10 });
    expect(runs.items[0]?.advanced).toBe(3);
    expect(calls).toEqual([
      [`http://api.test/admin/v1/users/${id}/sessions/revoke`, '{"reason":"Robo"}'],
      [`http://api.test/admin/v1/users/${id}/block`, '{"reason":"Fraude"}'],
      [`http://api.test/admin/v1/users/${id}/pii/reveal`, '{"reason":"Verificar"}'],
      [`http://api.test/admin/v1/users/${id}/notes`, undefined],
      [`http://api.test/admin/v1/users/${id}/notes`, '{"body":"Nota"}'],
      ['http://api.test/admin/v1/cycle-runs?limit=10', undefined],
    ]);
  });
});

describe('ciclo mensual', () => {
  it('lista las ejecuciones con las juntas que fallaron enlazadas', async () => {
    const cycleRuns = new InMemoryCycleRuns({
      items: [
        {
          id: '00000000-0000-4000-9000-000000000072',
          businessDate: '2026-12-01',
          startedAt: NOW,
          finishedAt: NOW,
          advanced: 4,
          locked: 1,
          failed: 1,
          failures: [
            { circleId: '00000000-0000-4000-8000-000000000042', reason: 'No se pudo cobrar' },
          ],
        },
      ],
      nextCursor: null,
    });
    renderApp({ path: '/cycle-runs', auth: signedIn(['support']), cycleRuns });
    expect(await screen.findByText('1 con error')).toBeInTheDocument();
    expect(screen.getByText('Avanzaron 4 · Bloqueadas 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver junta' })).toHaveAttribute(
      'href',
      '/circles/00000000-0000-4000-8000-000000000042',
    );
    expect(screen.getByRole('link', { name: 'Ciclo mensual' })).toBeInTheDocument();
  });

  it('sin ejecuciones lo explica', async () => {
    renderApp({ path: '/cycle-runs', auth: signedIn(['finance']) });
    expect(await screen.findByText('La tarea diaria todavía no corrió')).toBeInTheDocument();
  });
});
