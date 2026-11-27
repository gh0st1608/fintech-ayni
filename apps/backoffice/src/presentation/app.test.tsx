import { screen, waitFor, within } from '@testing-library/react';

import type { StaffRole } from '@/domain/staff/Staff';
import { AppError } from '@/domain/shared/AppError';
import { circle, InMemoryCircles, InMemoryStaffAuth, NOW } from '@test/fakes';
import { renderApp } from '@test/renderApp';

function signedIn(roles: StaffRole[]) {
  const auth = new InMemoryStaffAuth();
  auth.staff = {
    staffId: 'dev:ops@ayni.local',
    email: 'ops@ayni.local',
    roles,
    authenticatedAt: NOW,
  };
  return auth;
}

describe('sesión y rutas', () => {
  it('sin sesión lleva al login y vuelve a la página pedida al ingresar', async () => {
    const target = circle();
    const { user, router } = renderApp({
      path: `/circles/${target.circleId}`,
      circles: new InMemoryCircles([target]),
    });
    await user.type(await screen.findByLabelText('Email'), 'ops@ayni.local');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('heading', { name: /Junta de/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/circles/${target.circleId}`);
  });

  it('el login muestra el error de validación', async () => {
    const { user } = renderApp({ path: '/login' });
    await user.type(await screen.findByLabelText('Email'), 'ops@ayni.local');
    await user.click(screen.getByRole('checkbox', { name: 'Operaciones' }));
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige al menos un rol');
  });

  it('cerrar sesión vuelve al login', async () => {
    const { user } = renderApp({ path: '/circles', auth: signedIn(['support']) });
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('un rol sin acceso a juntas no las ve ni en el menú ni por la URL', async () => {
    renderApp({ path: '/circles', auth: signedIn(['admin']) });
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Juntas' })).not.toBeInTheDocument();
  });

  it('la portada lleva a juntas, o explica que no hay secciones para el rol', async () => {
    const { router } = renderApp({ auth: signedIn(['finance']) });
    await waitFor(() => expect(router.state.location.pathname).toBe('/circles'));
  });

  it('sin secciones para el rol lo explica', async () => {
    renderApp({ auth: signedIn(['admin']) });
    expect(await screen.findByText('No hay secciones para tu rol todavía')).toBeInTheDocument();
  });

  it('una ruta inexistente lo dice', async () => {
    renderApp({ path: '/nada', auth: signedIn(['support']) });
    expect(await screen.findByText('No encontramos esta página')).toBeInTheDocument();
  });
});

describe('listado de juntas', () => {
  it('muestra pozo, estado, inicio y turnos ocupados', async () => {
    renderApp({
      path: '/circles',
      auth: signedIn(['support']),
      circles: new InMemoryCircles([circle({ state: 'paused', members: 3 })]),
    });
    await screen.findByRole('link', { name: /6.?000/ });
    // La fila 0 es el encabezado.
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveTextContent('Pausada');
    expect(row).toHaveTextContent('3 de 6 (50 %)');
  });

  it('filtra por estado desde la URL y permite volver a todos', async () => {
    const circles = new InMemoryCircles([
      circle({ state: 'approving' }),
      circle({ state: 'finished' }),
    ]);
    const { user, router } = renderApp({
      path: '/circles',
      auth: signedIn(['operations']),
      circles,
    });
    await screen.findAllByRole('link', { name: /6.?000/ });
    await user.selectOptions(screen.getByLabelText('Estado'), 'approving');
    await waitFor(() => expect(router.state.location.search).toBe('?state=approving'));
    expect(await screen.findAllByText('Esperando aprobación')).not.toHaveLength(0);
    expect(screen.queryByText('Finalizada', { selector: 'span' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Estado'), '');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('cada fila trae su cadencia y el día real de arranque', async () => {
    renderApp({
      path: '/circles',
      auth: signedIn(['support']),
      circles: new InMemoryCircles([
        circle({ cadence: 'weekly', turns: 4, startsOn: '2026-11', startsOnDate: '2026-11-04' }),
      ]),
    });
    await screen.findByRole('link', { name: /6.?000/ });
    const row = screen.getAllByRole('row')[1];

    expect(row).toHaveTextContent('Semanal');
    // El 4 de noviembre, no «noviembre»: fuera de la mensual el arranque no es el día 1.
    expect(row).toHaveTextContent(/4 nov\.? 2026/);
    expect(row).toHaveTextContent('4 de 4');
  });

  it('filtra por cadencia sin perder el filtro de estado', async () => {
    const circles = new InMemoryCircles([
      circle({ state: 'contributing', cadence: 'monthly' }),
      circle({ state: 'contributing', cadence: 'weekly' }),
    ]);
    const { user, router } = renderApp({
      path: '/circles?state=contributing',
      auth: signedIn(['operations']),
      circles,
    });
    await screen.findAllByRole('link', { name: /6.?000/ });

    await user.selectOptions(screen.getByLabelText('Cadencia'), 'weekly');
    await waitFor(() => expect(circles.requests.at(-1)).toMatchObject({ cadence: 'weekly' }));
    // Los dos filtros conviven en la URL: cambiar uno no borra el otro.
    expect(router.state.location.search).toContain('state=contributing');
    expect(router.state.location.search).toContain('cadence=weekly');
    // La etiqueta de la fila, no la opción del filtro: las dos dicen lo mismo.
    expect(await screen.findAllByText('Semanal', { selector: 'span' })).not.toHaveLength(0);
    expect(screen.queryByText('Mensual', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('pagina con "Cargar más"', async () => {
    const circles = new InMemoryCircles([circle(), circle(), circle()]);
    circles.pageSize = 2;
    const { user } = renderApp({ path: '/circles', auth: signedIn(['support']), circles });
    expect(await screen.findAllByRole('link', { name: /6.?000/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByRole('link', { name: /6.?000/ })).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('sin resultados lo explica', async () => {
    renderApp({ path: '/circles?state=cancelled', auth: signedIn(['support']) });
    expect(await screen.findByText('No hay juntas en este estado')).toBeInTheDocument();
  });

  it('si falla, lo explica con el código de seguimiento y permite reintentar', async () => {
    const circles = new InMemoryCircles([circle()]);
    const list = jest
      .spyOn(circles, 'list')
      .mockRejectedValueOnce(new AppError('server', 'down', 'UNAVAILABLE', 'trace-9'));
    const { user } = renderApp({ path: '/circles', auth: signedIn(['support']), circles });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Código de seguimiento: trace-9');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /6.?000/ })).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('detalle de una junta', () => {
  it('muestra los miembros enmascarados y la propuesta de inicio', async () => {
    const target = circle({
      state: 'approving',
      startProposal: {
        round: 2,
        payout: { amount: 300_000, currency: 'PEN' },
        months: 3,
        respondBy: '2026-11-13',
        accepted: 1,
        withdrawn: 1,
      },
      memberships: [
        ...circle().memberships,
        {
          userId: '22222222-2222-4222-8222-222222222222',
          position: 2,
          name: null,
          email: null,
          phone: null,
          joinedAt: NOW,
          expelledAt: NOW,
        },
      ],
    });
    renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['operations']),
      circles: new InMemoryCircles([target]),
    });
    expect(await screen.findByText(/ronda 2/)).toBeInTheDocument();
    expect(screen.getByText(/Aceptaron 1 y se retiraron 1/)).toBeInTheDocument();
    const members = screen.getByRole('table', { name: 'Miembros de la junta' });
    expect(members).toHaveTextContent('j***@mail.com');
    expect(members).toHaveTextContent('Expulsado');
    // Operaciones no pausa: solo el admin general.
    expect(screen.queryByRole('button', { name: /Pausar|Reanudar/ })).not.toBeInTheDocument();
  });

  it('una junta inexistente o un id inválido lo dicen', async () => {
    renderApp({
      path: '/circles/00000000-0000-4000-8000-999999999999',
      auth: signedIn(['support']),
    });
    expect(await screen.findByText('Esa junta no existe')).toBeInTheDocument();
  });

  it('un id que no es UUID no consulta al backend', async () => {
    const circles = new InMemoryCircles();
    const get = jest.spyOn(circles, 'get');
    renderApp({ path: '/circles/123', auth: signedIn(['support']), circles });
    expect(await screen.findByText('Esa junta no existe')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('si falla la carga, permite reintentar', async () => {
    const target = circle();
    const circles = new InMemoryCircles([target]);
    jest.spyOn(circles, 'get').mockRejectedValueOnce(new AppError('network', 'offline'));
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['support']),
      circles,
    });
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Junta de/ })).toBeInTheDocument();
  });
});

describe('detalle de una junta con muchos turnos (COPAYNI-118)', () => {
  /** Una junta semanal larga: 40 turnos, el tipo de junta que el catálogo por rango permite. */
  const longCircle = () =>
    circle({
      cadence: 'weekly',
      turns: 40,
      startsOn: '2026-11',
      startsOnDate: '2026-11-04',
      members: 40,
      memberships: Array.from({ length: 40 }, (_unused, index) => ({
        userId: `3333333${String(index).padStart(2, '0')}-3333-4333-8333-333333333333`,
        position: index + 1,
        name: `Socio ${index + 1}`,
        email: null,
        phone: null,
        joinedAt: NOW,
        expelledAt: null,
      })),
    });

  it('muestra la cadencia y el día real de arranque', async () => {
    const target = longCircle();
    renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['operations']),
      circles: new InMemoryCircles([target]),
    });

    expect(await screen.findByText('Semanal')).toBeInTheDocument();
    expect(screen.getByText(/4 nov\.? 2026/)).toBeInTheDocument();
    expect(screen.getByText('40 de 40')).toBeInTheDocument();
  });

  it('pagina el listado de turnos en lugar de renderizarlos todos', async () => {
    const target = longCircle();
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['operations']),
      circles: new InMemoryCircles([target]),
    });
    await screen.findByText('Socio 1');

    // 25 de entrada, más la fila del encabezado.
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.queryByText('Socio 40')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver más turnos \(15 restantes\)/ }));

    expect(await screen.findByText('Socio 40')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver más turnos/ })).not.toBeInTheDocument();
  });
});

describe('pausar y reanudar', () => {
  it('el admin general pausa con motivo y ve el estado nuevo', async () => {
    const target = circle({ state: 'contributing' });
    const circles = new InMemoryCircles([target]);
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['super_admin']),
      circles,
    });
    await user.click(await screen.findByRole('button', { name: 'Pausar junta' }));
    const dialog = screen.getByRole('dialog', { name: 'Pausar la junta' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(within(dialog).getByText('Escribe el motivo')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Motivo'), 'Reclamo de un miembro');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('La junta quedó pausada.');
    expect(circles.pauses).toEqual([
      { circleId: target.circleId, action: 'pause', reason: 'Reclamo de un miembro' },
    ]);
    expect(await screen.findByRole('button', { name: 'Reanudar junta' })).toBeInTheDocument();
  });

  it('cancelar cierra el diálogo sin pausar', async () => {
    const target = circle({ state: 'paused', pausedOn: '2026-12-10' });
    const circles = new InMemoryCircles([target]);
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['super_admin']),
      circles,
    });
    await user.click(await screen.findByRole('button', { name: 'Reanudar junta' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(circles.pauses).toHaveLength(0);
  });

  it('si la autenticación ya no es reciente, ofrece volver a iniciar sesión', async () => {
    const target = circle();
    const circles = new InMemoryCircles([target]);
    jest
      .spyOn(circles, 'setPause')
      .mockRejectedValue(new AppError('step_up_required', 'Vuelve a autenticarte'));
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['super_admin']),
      circles,
    });
    await user.click(await screen.findByRole('button', { name: 'Pausar junta' }));
    await user.type(screen.getByLabelText('Motivo'), 'Reclamo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/vuelve a iniciar sesión para confirmar/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' }));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('un rechazo de negocio se muestra en el diálogo', async () => {
    const target = circle();
    const circles = new InMemoryCircles([target]);
    jest
      .spyOn(circles, 'setPause')
      .mockRejectedValue(new AppError('business', 'El círculo no está en curso'));
    const { user } = renderApp({
      path: `/circles/${target.circleId}`,
      auth: signedIn(['super_admin']),
      circles,
    });
    await user.click(await screen.findByRole('button', { name: 'Pausar junta' }));
    await user.type(screen.getByLabelText('Motivo'), 'Reclamo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El círculo no está en curso');
  });
});
