import { screen, waitFor, within } from '@testing-library/react';

import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryHomeContent, InMemoryStaffAuth, NOW } from '@test/fakes';
import { renderApp } from '@test/renderApp';

/** Contenido de Home en el back-office (COPAYNI-25): ofertas y metas populares. */
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

const open = (roles: StaffRole[] = ['operations'], homeContent = new InMemoryHomeContent()) =>
  renderApp({ path: '/content', auth: signedIn(roles), homeContent });

/** La sección ya cargada; la lista llega después de la consulta. */
async function section(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  const parent = heading.closest('section');
  if (!parent) throw new Error(`La sección "${name}" no está dentro de un <section>`);
  return parent;
}

describe('contenido de Home', () => {
  it('lista las ofertas y las metas con su destino y quién las tocó', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Contenido de Home' })).toBeInTheDocument();

    const offers = await section('Ofertas del carrusel');
    expect(within(offers).getByRole('article')).toHaveTextContent('Nuevas ofertas');
    expect(within(offers).getByText(/Invita a un amigo/)).toBeInTheDocument();
    // Sin traducción, la app muestra el español: conviene verlo en la lista.
    expect(within(offers).getByText(/sin inglés/)).toBeInTheDocument();

    const goals = await section('Metas populares');
    expect(within(goals).getByRole('article')).toHaveTextContent('Ahorro');
    expect(within(goals).getByText(/Planes de ahorro/)).toBeInTheDocument();
  });

  it('crea una meta nueva con su destino y monto', async () => {
    const homeContent = new InMemoryHomeContent();
    const { user } = open(['operations'], homeContent);

    const goals = await section('Metas populares');
    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));
    await user.type(within(goals).getByLabelText('Título (es)'), 'Fiestas Patrias');
    await user.selectOptions(within(goals).getByLabelText('Destino'), 'join_circle');
    await user.type(within(goals).getByLabelText('Monto precargado (en soles)'), '3000');
    await user.click(within(goals).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(homeContent.saves).toHaveLength(1));
    expect(homeContent.saves[0]).toMatchObject({
      kind: 'goal',
      id: null,
      input: {
        target: 'join_circle',
        // El monto viaja en unidades menores.
        targetAmount: 300_000,
        active: true,
      },
    });
    expect(homeContent.saves[0]?.input.texts.es.title).toBe('Fiestas Patrias');
  });

  it('el monto solo aparece con el destino que lo usa', async () => {
    const { user } = open();
    const goals = await section('Metas populares');
    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));

    expect(within(goals).queryByLabelText('Monto precargado (en soles)')).not.toBeInTheDocument();
    await user.selectOptions(within(goals).getByLabelText('Destino'), 'join_circle');
    expect(within(goals).getByLabelText('Monto precargado (en soles)')).toBeInTheDocument();
  });

  it('no deja guardar sin el título en español, que es al que cae la app', async () => {
    const homeContent = new InMemoryHomeContent();
    const { user } = open(['operations'], homeContent);
    const goals = await section('Metas populares');

    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));
    await user.type(within(goals).getByLabelText('Título (en)'), 'Only English');
    await user.click(within(goals).getByRole('button', { name: 'Guardar' }));

    expect(await within(goals).findByRole('alert')).toHaveTextContent(
      'El título en español es obligatorio.',
    );
    expect(homeContent.saves).toHaveLength(0);
  });

  it('solo se ofrecen pantallas de la app como destino, nunca una URL', async () => {
    const { user } = open();
    const goals = await section('Metas populares');
    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));

    const options = within(within(goals).getByLabelText('Destino')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Planes de ahorro',
      'Unirse a una junta',
      'Invita a un amigo',
      'Ayuda',
      'Sin destino (informativa)',
    ]);
  });

  it('borrar pide confirmación y explica que apagar es la alternativa', async () => {
    const homeContent = new InMemoryHomeContent();
    const { user } = open(['operations'], homeContent);
    const goals = await section('Metas populares');

    await user.click(within(goals).getByRole('button', { name: 'Borrar' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/apágala en vez de borrarla/i);
    await user.click(within(dialog).getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(homeContent.removed).toEqual([{ kind: 'goal', id: 'g-1' }]));
  });

  it('un rol que no edita contenido solo mira', async () => {
    open(['support']);
    const offers = await section('Ofertas del carrusel');
    expect(within(offers).getByRole('article')).toHaveTextContent('Nuevas ofertas');
    expect(screen.queryByRole('button', { name: 'Agregar meta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument();
  });

  it('editar una oferta trae sus datos y permite ponerle vigencia', async () => {
    const homeContent = new InMemoryHomeContent();
    const { user } = open(['operations'], homeContent);
    const offers = await section('Ofertas del carrusel');

    await user.click(within(offers).getByRole('button', { name: 'Editar' }));
    expect(within(offers).getByLabelText('Título (es)')).toHaveValue('Nuevas ofertas');

    // La vigencia solo existe en las ofertas: una meta no caduca.
    await user.type(within(offers).getByLabelText('Se muestra hasta'), '2026-12-31');
    await user.click(within(offers).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(homeContent.saves).toHaveLength(1));
    expect(homeContent.saves[0]).toMatchObject({
      kind: 'offer',
      id: 'o-1',
      input: { endsOn: '2026-12-31' },
    });
  });

  it('las metas no ofrecen vigencia', async () => {
    const { user } = open();
    const goals = await section('Metas populares');
    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));
    expect(within(goals).queryByLabelText('Se muestra hasta')).not.toBeInTheDocument();
  });

  it('si el contenido no carga, lo dice y deja reintentar', async () => {
    const homeContent = new InMemoryHomeContent();
    const failing = jest.spyOn(homeContent, 'get').mockRejectedValueOnce(new Error('sin red'));
    const { user } = open(['operations'], homeContent);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Metas populares' })).toBeInTheDocument();
    failing.mockRestore();
  });

  it('cancelar cierra el formulario sin guardar', async () => {
    const homeContent = new InMemoryHomeContent();
    const { user } = open(['operations'], homeContent);
    const goals = await section('Metas populares');

    await user.click(within(goals).getByRole('button', { name: 'Agregar meta' }));
    await user.click(within(goals).getByRole('button', { name: 'Cancelar' }));
    expect(within(goals).queryByLabelText('Título (es)')).not.toBeInTheDocument();
    expect(homeContent.saves).toHaveLength(0);
  });

  it('un rol sin acceso al contenido no lo ve ni en el menú ni por la URL', async () => {
    open(['finance']);
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contenido' })).not.toBeInTheDocument();
  });
});
