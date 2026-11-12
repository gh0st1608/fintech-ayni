import { screen, waitFor } from '@testing-library/react';

import { SaveHelpUseCase } from '@/application/usecases';
import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryHelp, InMemoryStaffAuth, NOW } from '@test/fakes';
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

const staff = (roles: StaffRole[]) => ({
  staffId: 'dev:ops@ayni.local',
  email: null,
  roles,
  authenticatedAt: NOW,
});

describe('ayuda: reglas', () => {
  it('descarta preguntas vacías, exige respuesta y el permiso de edición', async () => {
    const help = new InMemoryHelp();
    const save = new SaveHelpUseCase(help);
    expect(() => save.execute(staff(['support']), 'es', { faqs: [], paymentPolicy: null })).toThrow(
      'Tu rol no permite',
    );
    expect(() =>
      save.execute(staff(['operations']), 'es', {
        faqs: [{ question: '¿Hola?', answer: ' ' }],
        paymentPolicy: null,
      }),
    ).toThrow('Cada pregunta necesita su respuesta');
    await save.execute(staff(['operations']), 'es', {
      faqs: [
        { question: ' ¿Hola? ', answer: ' Sí ' },
        { question: '', answer: '' },
      ],
      paymentPolicy: '   ',
    });
    expect(help.saves).toEqual([
      {
        language: 'es',
        input: { faqs: [{ question: '¿Hola?', answer: 'Sí' }], paymentPolicy: null },
      },
    ]);
  });
});

describe('ayuda: pantalla', () => {
  it('Operaciones edita, ordena y publica las preguntas y la política', async () => {
    const help = new InMemoryHelp();
    const { user } = renderApp({ path: '/help', auth: signedIn(['operations']), help });

    expect(await screen.findByDisplayValue('¿Qué pasa si no pago a tiempo?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar pregunta' }));
    await user.type(screen.getByLabelText('Pregunta 2'), '¿Cuándo recibo mi pozo?');
    await user.type(screen.getByLabelText('Respuesta 2'), 'En tu mes de cobro.');
    await user.click(screen.getByRole('button', { name: 'Subir la pregunta 2' }));
    await user.type(screen.getByLabelText('Texto de la política'), 'Las cuotas vencen el día 1.');
    await user.click(screen.getByRole('button', { name: 'Guardar y publicar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se publicó la ayuda.');
    expect(help.saves[0]).toEqual({
      language: 'es',
      input: {
        faqs: [
          { question: '¿Cuándo recibo mi pozo?', answer: 'En tu mes de cobro.' },
          { question: '¿Qué pasa si no pago a tiempo?', answer: 'Tienes 3 días de gracia.' },
        ],
        paymentPolicy: 'Las cuotas vencen el día 1.',
      },
    });
  });

  it('cambia de idioma y avisa que sin preguntas se muestra el español', async () => {
    const { user } = renderApp({ path: '/help', auth: signedIn(['super_admin']) });
    await user.click(await screen.findByRole('button', { name: 'Inglés' }));
    expect(
      await screen.findByText('Sin preguntas: la app mostrará las del español.'),
    ).toBeInTheDocument();
  });

  it('Soporte solo lee; Finanzas no ve la sección', async () => {
    renderApp({ path: '/help', auth: signedIn(['support']) });
    expect(await screen.findByDisplayValue('¿Qué pasa si no pago a tiempo?')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar y publicar' })).not.toBeInTheDocument();
  });

  it('Finanzas no tiene acceso a la ayuda', async () => {
    renderApp({ path: '/help', auth: signedIn(['finance']) });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ayuda de la app' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Ayuda' })).not.toBeInTheDocument();
  });
});
