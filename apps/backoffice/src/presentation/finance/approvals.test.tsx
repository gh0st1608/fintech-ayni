import { screen, within } from '@testing-library/react';

import { ProposeFundMovementUseCase } from '@/application/usecases';
import { isSameStaff, parseAmount } from '@/domain/finance/Approval';
import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryFinance, InMemoryStaffAuth, NOW } from '@test/fakes';
import { renderApp } from '@test/renderApp';

const ME = { staffId: 'dev:luis@ayni.local', email: 'luis@ayni.local' };

function signedIn(roles: StaffRole[]) {
  const auth = new InMemoryStaffAuth();
  auth.staff = { ...ME, roles, authenticatedAt: NOW };
  return auth;
}

const staff = (roles: StaffRole[]) => ({ ...ME, roles, authenticatedAt: NOW });

describe('movimientos del fondo: reglas', () => {
  it('convierte el monto escrito a unidades menores', () => {
    expect(parseAmount('1500')).toBe(150_000);
    expect(parseAmount('1,500.5')).toBe(150_050);
    expect(parseAmount('-25.25')).toBe(-2525);
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('reconoce a la misma persona por id o email', () => {
    expect(isSameStaff(ME, { staffId: 'otro', email: 'LUIS@ayni.local' })).toBe(true);
    expect(isSameStaff(ME, { staffId: 'otro', email: null })).toBe(false);
  });

  it('el caso de uso valida permiso, monto y signo del capital semilla', async () => {
    const finance = new InMemoryFinance();
    const propose = new ProposeFundMovementUseCase(finance);
    const input = { kind: 'seed_capital' as const, amount: '100', currency: 'PEN', reason: 'Acta' };
    expect(() => propose.execute(staff(['support']), input)).toThrow('Tu rol no permite');
    expect(() => propose.execute(staff(['finance']), { ...input, amount: '0' })).toThrow(
      'Escribe un monto válido',
    );
    expect(() => propose.execute(staff(['finance']), { ...input, amount: '-5' })).toThrow(
      'El capital semilla siempre entra al fondo',
    );
    await propose.execute(staff(['finance']), { ...input, kind: 'adjustment', amount: '-5.5' });
    expect(finance.proposals).toEqual([
      { kind: 'adjustment', amount: -550, currency: 'PEN', reason: 'Acta' },
    ]);
  });
});

describe('movimientos del fondo: pantalla', () => {
  it('propone un movimiento y muestra que es propio: no se puede aprobar', async () => {
    const finance = new InMemoryFinance();
    finance.proposer = ME;
    const { user } = renderApp({
      path: '/finance?view=approvals',
      auth: signedIn(['finance']),
      finance,
    });

    expect(await screen.findByText('No hay propuestas con ese estado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Proponer movimiento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Proponer un movimiento del fondo' });
    await user.type(within(dialog).getByLabelText('Monto'), '50000');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Acta 2026-11');
    await user.click(within(dialog).getByRole('button', { name: 'Proponer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('quedó pendiente');
    expect(finance.proposals).toEqual([
      { kind: 'seed_capital', amount: 5_000_000, currency: 'PEN', reason: 'Acta 2026-11' },
    ]);
    expect(await screen.findByText('Es tu propuesta: la decide otra persona.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('otra persona aprueba la propuesta pendiente', async () => {
    const finance = new InMemoryFinance();
    await finance.proposeFundMovement({
      kind: 'seed_capital',
      amount: 5_000_000,
      currency: 'PEN',
      reason: 'Acta 2026-11',
    });
    const { user } = renderApp({
      path: '/finance?view=approvals',
      auth: signedIn(['super_admin']),
      finance,
    });

    expect(await screen.findByText('Acta 2026-11')).toBeInTheDocument();
    expect(screen.getByText(/Propuso ana@ayni.local/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar el movimiento' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se registró el movimiento');
    expect(finance.decisions).toEqual([
      { approvalId: finance.approvalItems[0]?.id, action: 'approve' },
    ]);
  });

  it('rechazar exige motivo; si aprobar pide autenticación reciente, lo ofrece', async () => {
    const finance = new InMemoryFinance();
    await finance.proposeFundMovement({
      kind: 'adjustment',
      amount: -2500,
      currency: 'PEN',
      reason: 'Corrección',
    });
    jest
      .spyOn(finance, 'approve')
      .mockRejectedValueOnce(new AppError('step_up_required', 'Vuelve a autenticarte'));
    const { user } = renderApp({
      path: '/finance?view=approvals',
      auth: signedIn(['finance']),
      finance,
    });

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    const approve = await screen.findByRole('dialog', { name: 'Aprobar el movimiento' });
    await user.click(within(approve).getByRole('button', { name: 'Confirmar' }));
    expect(
      await within(approve).findByRole('button', { name: 'Volver a iniciar sesión' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const reject = await screen.findByRole('dialog', { name: 'Rechazar la propuesta' });
    await user.click(within(reject).getByRole('button', { name: 'Confirmar' }));
    expect(await within(reject).findByRole('alert')).toHaveTextContent('Escribe el motivo');
    await user.type(within(reject).getByLabelText('Motivo'), 'No cuadra');
    await user.click(within(reject).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('quedó rechazada');
    expect(finance.decisions.at(-1)).toMatchObject({ action: 'reject', reason: 'No cuadra' });
  });
});
