import { screen, waitFor, within } from '@testing-library/react';

import { SearchUsersUseCase } from '@/application/usecases';
import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { isExactUserQuery } from '@/domain/users/User';
import { UsersApiRepository } from '@/infrastructure/api/adapters';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { TokenStore } from '@/infrastructure/http/TokenStore';
import { InMemoryStaffAuth, InMemoryUsers, NOW, person } from '@test/fakes';
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

describe('búsqueda exacta', () => {
  it('admite email completo, teléfono con código de país o id; nada parcial', () => {
    expect(isExactUserQuery(' rosa@mail.com ')).toBe(true);
    expect(isExactUserQuery('+51 987 654-321')).toBe(true);
    expect(isExactUserQuery('00000000-0000-4000-a000-000000000001')).toBe(true);
    for (const partial of ['rosa', '987654321', 'mail.com', '+51', '']) {
      expect(isExactUserQuery(partial)).toBe(false);
    }
    expect(() => new SearchUsersUseCase(new InMemoryUsers()).execute('rosa')).toThrow(AppError);
  });

  it('el adaptador manda la búsqueda codificada y valida el contrato', async () => {
    const calls: string[] = [];
    const userId = '00000000-0000-4000-a000-000000000001';
    const body = (data: unknown) => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data, traceId: 't' }),
    });
    const fetchFn = jest.fn((url: URL | RequestInfo) => {
      calls.push(url instanceof URL ? url.href : typeof url === 'string' ? url : url.url);
      return Promise.resolve(
        (calls.length === 1
          ? body({
              items: [
                {
                  userId,
                  status: 'active',
                  name: null,
                  email: 'r***@mail.com',
                  phone: null,
                  preferredLanguage: null,
                  createdAt: '2026-11-09T15:00:00.000Z',
                  blocked: null,
                },
              ],
            })
          : body({
              userId,
              status: 'pending_verification',
              name: null,
              email: null,
              phone: '+51******321',
              preferredLanguage: 'es',
              createdAt: '2026-11-09T15:00:00.000Z',
              blocked: null,
              kyc: {
                national_id: 'not_submitted',
                proof_of_income: 'not_submitted',
                additional: 'not_submitted',
              },
              circles: [
                {
                  circleId: '00000000-0000-4000-8000-000000000009',
                  state: 'contributing',
                  payout: { amount: 600000, currency: 'PEN' },
                  months: 6,
                  position: 2,
                  joinedAt: '2026-11-09T15:00:00.000Z',
                  expelledAt: null,
                },
              ],
            })) as Response,
      );
    }) as unknown as typeof fetch;
    const repository = new UsersApiRepository(
      new FetchHttpClient('http://api.test', new TokenStore(), 5_000, fetchFn),
    );
    await expect(repository.search('+51 987')).resolves.toHaveLength(1);
    await expect(repository.get(userId)).resolves.toMatchObject({ circles: [{ position: 2 }] });
    expect(calls).toEqual([
      'http://api.test/admin/v1/users?query=%2B51+987',
      `http://api.test/admin/v1/users/${userId}`,
    ]);
  });
});

describe('pantalla de personas', () => {
  it('busca por email exacto, guarda la búsqueda en la URL y abre el perfil', async () => {
    const rosa = person({
      circles: [
        {
          circleId: '00000000-0000-4000-8000-000000000042',
          state: 'contributing',
          payout: { amount: 600_000, currency: 'PEN' },
          months: 6,
          position: 2,
          joinedAt: NOW,
          expelledAt: NOW,
        },
      ],
    });
    const users = new InMemoryUsers([rosa], { 'rosa@mail.com': rosa.userId });
    const { user, router } = renderApp({ path: '/users', auth: signedIn(['support']), users });

    expect(await screen.findByText('Busca a una persona')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar persona'), 'rosa');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(/Escribe el email completo/)).toBeInTheDocument();
    expect(users.searches).toEqual([]);

    await user.clear(screen.getByLabelText('Buscar persona'));
    await user.type(screen.getByLabelText('Buscar persona'), 'rosa@mail.com');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('link', { name: 'Rosa Q.' }));
    expect(router.state.location.pathname).toBe(`/users/${rosa.userId}`);
    expect(users.searches).toEqual(['rosa@mail.com']);

    expect(await screen.findByRole('heading', { name: 'Rosa Q.' })).toBeInTheDocument();
    const documents = screen.getByRole('heading', { name: 'Documentos' }).closest('section');
    if (!documents) throw new Error('Falta la sección de documentos');
    expect(within(documents).getByText('Aprobado')).toBeInTheDocument();
    expect(within(documents).getByText('En revisión')).toBeInTheDocument();
    expect(screen.getByText('Expulsada')).toBeInTheDocument();
    // Soporte ve juntas: el pozo enlaza al detalle.
    expect(screen.getByRole('link', { name: /6,000\.00/ })).toHaveAttribute(
      'href',
      '/circles/00000000-0000-4000-8000-000000000042',
    );
  });

  it('sin resultados lo dice; una búsqueda inválida en la URL no consulta', async () => {
    const users = new InMemoryUsers();
    renderApp({ path: '/users?q=nadie%40mail.com', auth: signedIn(['finance']), users });
    expect(await screen.findByText('No encontramos a nadie con ese dato')).toBeInTheDocument();
    expect(users.searches).toEqual(['nadie@mail.com']);
  });

  it('una búsqueda parcial en la URL lo explica sin consultar', async () => {
    const users = new InMemoryUsers();
    renderApp({ path: '/users?q=rosa', auth: signedIn(['operations']), users });
    expect(await screen.findByText('Esa búsqueda no es válida')).toBeInTheDocument();
    expect(users.searches).toEqual([]);
  });

  it('si la búsqueda falla, permite reintentar', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const failing = jest
      .spyOn(users, 'search')
      .mockRejectedValueOnce(new AppError('server', 'falla', undefined, 'trace-users'));
    const { user } = renderApp({
      path: `/users?q=${rosa.userId}`,
      auth: signedIn(['support']),
      users,
    });
    expect(await screen.findByText(/trace-users/)).toBeInTheDocument();
    failing.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Rosa Q.' })).toBeInTheDocument();
  });

  it('el perfil sin juntas lo dice; sin permiso de juntas el pozo no enlaza', async () => {
    const solo = person({ name: null, circles: [] });
    renderApp({
      path: `/users/${solo.userId}`,
      auth: signedIn(['support']),
      users: new InMemoryUsers([solo]),
    });
    expect(await screen.findByRole('heading', { name: 'Persona sin nombre' })).toBeInTheDocument();
    expect(screen.getByText('No está en ninguna junta')).toBeInTheDocument();
  });

  it('una persona inexistente, un id inválido o un error de carga se explican', async () => {
    renderApp({
      path: '/users/00000000-0000-4000-a000-000000000999',
      auth: signedIn(['support']),
    });
    expect(await screen.findByText('Esa persona no existe')).toBeInTheDocument();
  });

  it('un id que no es UUID no consulta, y un error de carga permite reintentar', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const get = jest.spyOn(users, 'get').mockRejectedValueOnce(new AppError('network', 'sin red'));
    const first = renderApp({ path: '/users/no-es-uuid', auth: signedIn(['support']), users });
    expect(await screen.findByText('Revisa el enlace.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    await first.router.navigate(`/users/${rosa.userId}`);
    await first.user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Rosa Q.' })).toBeInTheDocument(),
    );
  });

  it('el menú muestra Personas a quien puede buscar, y no al admin del personal', async () => {
    renderApp({ path: '/users', auth: signedIn(['admin']) });
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Personas' })).not.toBeInTheDocument();
  });
});
