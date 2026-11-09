import { screen, waitFor, within } from '@testing-library/react';

import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryKyc, InMemoryStaffAuth, kycReview, NOW } from '@test/fakes';
import { renderApp } from '@test/renderApp';

import { parseAmount } from './KycReviewScreen';

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

const operations = () => signedIn(['operations']);

describe('cola de KYC', () => {
  it('operaciones entra directo a la cola, con la persona enmascarada', async () => {
    const pending = kycReview({ superseded: true });
    const { router } = renderApp({ auth: operations(), kyc: new InMemoryKyc([pending]) });

    await waitFor(() => expect(router.state.location.pathname).toBe('/kyc'));
    const row = (await screen.findByRole('link', { name: 'Documento de identidad' })).closest('tr');
    if (!row) throw new Error('La fila del documento no está');
    const cells = within(row);
    expect(cells.getByText('Ana R.')).toBeInTheDocument();
    expect(cells.getByText('Hay uno más nuevo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('filtra por estado y tipo desde la URL', async () => {
    const kyc = new InMemoryKyc([
      kycReview(),
      kycReview({
        type: 'proof_of_income',
        kind: 'hr_letter',
        status: 'approved',
        monthlyIncome: { amount: 350_000, currency: 'PEN' },
      }),
    ]);
    const { user, router } = renderApp({ path: '/kyc', auth: operations(), kyc });
    expect(
      await screen.findByText('Del más antiguo al más nuevo: empieza por el primero.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Estado'), 'approved');
    expect(
      await screen.findByRole('link', { name: 'Comprobante de ingresos' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3,500\.00/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?status=approved');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'national_id');
    expect(await screen.findByText('No hay documentos')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo'), '');
    await user.selectOptions(screen.getByLabelText('Estado'), 'in_review');
    expect(router.state.location.search).toBe('');
  });

  it('sin pendientes dice que la cola está al día, y pagina con "Cargar más"', async () => {
    renderApp({ path: '/kyc', auth: operations() });
    expect(await screen.findByText('No hay documentos por revisar')).toBeInTheDocument();
  });

  it('pagina con "Cargar más"', async () => {
    const kyc = new InMemoryKyc([kycReview(), kycReview(), kycReview()]);
    kyc.pageSize = 2;
    const { user } = renderApp({ path: '/kyc', auth: operations(), kyc });
    expect(await screen.findAllByRole('link', { name: 'Documento de identidad' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Documento de identidad' })).toHaveLength(3),
    );
  });

  it('si falla, permite reintentar', async () => {
    const kyc = new InMemoryKyc([kycReview()]);
    const failing = jest
      .spyOn(kyc, 'list')
      .mockRejectedValueOnce(new AppError('server', 'falla', undefined, 'trace-kyc'));
    const { user } = renderApp({ path: '/kyc', auth: operations(), kyc });
    expect(await screen.findByText(/trace-kyc/)).toBeInTheDocument();
    failing.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Documento de identidad' })).toBeInTheDocument();
  });

  it('soporte y finanzas no ven la cola ni en el menú ni por la URL', async () => {
    renderApp({ path: '/kyc', auth: signedIn(['support', 'finance']) });
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Documentos' })).not.toBeInTheDocument();
  });
});

describe('revisión de un documento', () => {
  it('ver una página pide una URL corta en ese momento y la ofrece para abrir', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });

    expect(await screen.findByText('Página 2: Reverso')).toBeInTheDocument();
    expect(kyc.viewed).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Ver página 2' }));
    const link = await screen.findByRole('link', { name: 'Abrir la página 2 en otra pestaña' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/2?X-Amz-Expires=60'));
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(kyc.viewed).toEqual([{ id: pending.id, page: 2 }]);
  });

  it('aprueba con nota y muestra la decisión', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar el documento' });
    expect(within(dialog).queryByLabelText(/Ingreso mensual/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nota interna/), '  Coincide con RENIEC ');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByRole('heading', { name: 'Decisión' })).toBeInTheDocument();
    expect(screen.getByText(/Aprobado el .* por dev:ops@ayni.local/)).toBeInTheDocument();
    expect(kyc.approvals).toEqual([{ id: pending.id, approval: { note: 'Coincide con RENIEC' } }]);
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('en un comprobante, corrige el ingreso; un monto inválido no se envía', async () => {
    const pending = kycReview({
      type: 'proof_of_income',
      kind: 'hr_letter',
      pages: 1,
      monthlyIncome: { amount: 350_000, currency: 'PEN' },
      pageFiles: [{ page: 1, purpose: 'proof_of_income', sizeBytes: 10 }],
    });
    const kyc = new InMemoryKyc([pending]);
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar el documento' });
    const income = within(dialog).getByLabelText(/Ingreso mensual/);
    await user.type(income, 'mil');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
    expect(await within(dialog).findByText(/Escribe un monto válido/)).toBeInTheDocument();
    expect(kyc.approvals).toEqual([]);

    await user.clear(income);
    await user.type(income, '3200,50');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(kyc.approvals).toEqual([{ id: pending.id, approval: { monthlyIncome: 320_050 } }]),
    );
  });

  it('rechaza con un motivo del catálogo y muestra lo que verá la persona', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar el documento' });
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(await within(dialog).findByText('Elige el motivo del rechazo')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Motivo'), 'illegible');
    await user.type(within(dialog).getByLabelText(/Nota interna/), 'Foto movida');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

    expect(
      await screen.findByText('El documento no se pudo leer: vuelve a escanearlo'),
    ).toBeInTheDocument();
    expect(kyc.rejections).toEqual([
      { id: pending.id, rejection: { reason: 'illegible', note: 'Foto movida' } },
    ]);
  });

  it('si otra persona ya lo resolvió, lo dice y recarga el estado', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar el documento' });
    // Otra persona lo resuelve mientras el diálogo está abierto.
    (kyc.reviews[0] ?? pending).status = 'rejected';
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
    expect(await within(dialog).findByText('Este documento ya fue revisado')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Decisión' })).toBeInTheDocument();
  });

  it('un documento inexistente o un id inválido lo dicen', async () => {
    renderApp({ path: '/kyc/00000000-0000-4000-9000-000000000999', auth: operations() });
    expect(await screen.findByText('Ese documento no existe')).toBeInTheDocument();
  });

  it('un id que no es UUID no consulta al backend', async () => {
    const kyc = new InMemoryKyc();
    const get = jest.spyOn(kyc, 'get');
    renderApp({ path: '/kyc/no-es-uuid', auth: operations(), kyc });
    expect(await screen.findByText('Revisa el enlace.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('si falla la carga, permite reintentar', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    const failing = jest
      .spyOn(kyc, 'get')
      .mockRejectedValueOnce(new AppError('network', 'sin red'));
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    failing.mockRestore();
    expect(await screen.findByText('Página 1: Frente')).toBeInTheDocument();
  });

  it('si no se puede obtener la URL de una página, lo muestra', async () => {
    const pending = kycReview();
    const kyc = new InMemoryKyc([pending]);
    jest.spyOn(kyc, 'pageUrl').mockRejectedValueOnce(new AppError('server', 'falla'));
    const { user } = renderApp({ path: `/kyc/${pending.id}`, auth: operations(), kyc });
    await user.click(await screen.findByRole('button', { name: 'Ver página 1' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('parseAmount', () => {
  it('convierte soles a céntimos y rechaza lo que no es un monto', () => {
    expect(parseAmount('3200')).toBe(320_000);
    expect(parseAmount(' 3200.5 ')).toBe(320_050);
    expect(parseAmount('3200,05')).toBe(320_005);
    expect(parseAmount('3.200,00')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
