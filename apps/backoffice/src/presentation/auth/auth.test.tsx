import { screen, waitFor } from '@testing-library/react';

import { InMemoryOidcStaffAuth } from '@test/fakes';
import { renderApp } from '@test/renderApp';

/**
 * Login con SSO y vuelta del proveedor (COPAYNI-72). El intercambio del código lo cubren las
 * pruebas del adaptador; aquí se verifica lo que ve y hace la persona.
 */
beforeEach(() => {
  sessionStorage.clear();
});

describe('login con SSO', () => {
  it('ofrece el ingreso con SSO en vez del formulario de desarrollo', async () => {
    renderApp({ path: '/login', auth: new InMemoryOidcStaffAuth() });
    expect(
      await screen.findByRole('button', { name: 'Iniciar sesión con SSO' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Se requerirá MFA/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('inicia el flujo recordando la página que se quiso abrir', async () => {
    const auth = new InMemoryOidcStaffAuth();
    const { user } = renderApp({ path: '/finance', auth });
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión con SSO' }));
    expect(auth.flows).toEqual(['/finance']);
  });

  it('sin página previa, el flujo apunta a juntas', async () => {
    const auth = new InMemoryOidcStaffAuth();
    const { user } = renderApp({ path: '/login', auth });
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión con SSO' }));
    expect(auth.flows).toEqual(['/circles']);
  });
});

describe('vuelta del proveedor', () => {
  it('con el código correcto abre la sesión y vuelve a la página pedida', async () => {
    sessionStorage.setItem('oidc_return_to', '/users');
    const { router } = renderApp({
      path: '/auth/callback?code=code-1&state=state-1',
      auth: new InMemoryOidcStaffAuth(),
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
    // El destino es de un solo uso: no debe arrastrarse al siguiente login.
    expect(sessionStorage.getItem('oidc_return_to')).toBeNull();
  });

  it('sin destino guardado entra por la portada, que reparte según el rol', async () => {
    const { router } = renderApp({
      path: '/auth/callback?code=code-1&state=state-1',
      auth: new InMemoryOidcStaffAuth(),
    });
    // El doble entra con el rol de operaciones, que la portada lleva a la cola de KYC.
    await waitFor(() => expect(router.state.location.pathname).toBe('/kyc'));
  });

  it('muestra el aviso mientras completa el ingreso', async () => {
    renderApp({
      path: '/auth/callback?code=code-1&state=state-1',
      auth: new InMemoryOidcStaffAuth(),
    });
    expect(await screen.findByText('Completando inicio de sesión…')).toBeInTheDocument();
  });

  it('si el proveedor devuelve un error, vuelve al login', async () => {
    const { router } = renderApp({
      path: '/auth/callback?error=access_denied',
      auth: new InMemoryOidcStaffAuth(),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.state).toEqual({ oidcError: 'access_denied' });
  });

  it('si la vuelta llega sin código, vuelve al login', async () => {
    const { router } = renderApp({
      path: '/auth/callback?state=state-1',
      auth: new InMemoryOidcStaffAuth(),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('en modo de desarrollo la ruta de vuelta no hace nada y lleva al login', async () => {
    // Sin `handleCallback` (modo dev) la ruta existe pero no puede completar nada.
    const { router } = renderApp({ path: '/auth/callback?code=code-1&state=state-1' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('si el intercambio falla, lo explica sin dejar la pantalla cargando', async () => {
    const auth = new InMemoryOidcStaffAuth();
    auth.code = 'otro-codigo';
    renderApp({ path: '/auth/callback?code=code-1&state=state-1', auth });

    // Al personal se le dice qué hacer, no el detalle del protocolo.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu sesión terminó. Vuelve a iniciar sesión.',
    );
    expect(screen.queryByText('Completando inicio de sesión…')).not.toBeInTheDocument();
  });
});
