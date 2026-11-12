import { screen, within } from '@testing-library/react';

import { RegisterPayoutAccountUseCase } from '@/application/usecases';
import { isValidCci, isValidWalletPhone } from '@/domain/payouts/PayoutAccount';
import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryStaffAuth, InMemoryUsers, NOW, person } from '@test/fakes';
import { renderApp } from '@test/renderApp';

/** CCI válido del BCP (002) y otro del BBVA (011). */
const BCP_CCI = '00219300165123456715';
const BBVA_CCI = '01181400020012345612';

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

describe('cuenta de cobro', () => {
  it('valida el CCI y el celular como el backend', () => {
    expect(isValidCci(BCP_CCI)).toBe(true);
    expect(isValidCci('002-193-001651234567-15')).toBe(true);
    expect(isValidCci('00219300165123456716')).toBe(false);
    expect(isValidWalletPhone('+51 987 654 321')).toBe(true);
    expect(isValidWalletPhone('87654321')).toBe(false);
  });

  it('el caso de uso exige el permiso, un CCI del banco elegido y motivo', async () => {
    const users = new InMemoryUsers();
    const register = new RegisterPayoutAccountUseCase(users);
    const form = {
      kind: 'bank_account' as const,
      bankCode: '002',
      accountType: 'savings' as const,
      cci: BCP_CCI,
      holderName: 'Rosa Quispe',
    };
    expect(() => register.execute(staff(['support']), 'u1', form, 'Constancia')).toThrow(
      'Tu rol no permite esta acción',
    );
    expect(() =>
      register.execute(staff(['operations']), 'u1', { ...form, cci: BBVA_CCI }, 'Constancia'),
    ).toThrow('El CCI no es del banco elegido');
    expect(() => register.execute(staff(['operations']), 'u1', form, ' ')).toThrow(
      'Escribe el motivo',
    );
    await register.execute(
      staff(['operations']),
      'u1',
      { ...form, cci: '002 193 001651234567 15', holderName: ' Rosa   Quispe ' },
      ' Constancia ',
    );
    expect(users.registrations).toEqual([
      {
        userId: 'u1',
        form: { ...form, cci: BCP_CCI, holderName: 'Rosa Quispe' },
        reason: 'Constancia',
      },
    ]);
  });

  it('Operaciones registra la cuenta bancaria y la ve enmascarada', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['operations']),
      users,
    });

    expect(await screen.findByText('Sin cuenta de cobro')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar la cuenta de cobro' });
    await user.selectOptions(within(dialog).getByLabelText('Banco'), '002');
    await user.type(within(dialog).getByLabelText('CCI'), '00219300165123456716');
    await user.type(within(dialog).getByLabelText('Titular'), 'Rosa Quispe');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Constancia enviada por correo');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El CCI no es válido');

    await user.clear(within(dialog).getByLabelText('CCI'));
    await user.type(within(dialog).getByLabelText('CCI'), BCP_CCI);
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se registró BCP •••• 4567.');
    expect(await screen.findByText('BCP •••• 4567')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.queryByText(BCP_CCI)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar cuenta' })).toBeInTheDocument();
  });

  it('cambia a Yape y deja la anterior en el historial', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    await users.registerPayoutAccount(
      rosa.userId,
      {
        kind: 'bank_account',
        bankCode: '002',
        accountType: 'savings',
        cci: BCP_CCI,
        holderName: 'Rosa Quispe',
      },
      'Alta',
    );
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['super_admin']),
      users,
    });

    await user.click(await screen.findByRole('button', { name: 'Cambiar cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar la cuenta de cobro' });
    await user.click(within(dialog).getByRole('radio', { name: 'Yape / Plin' }));
    await user.type(within(dialog).getByLabelText('Celular'), '987654321');
    await user.type(within(dialog).getByLabelText('Titular'), 'Rosa Quispe');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Cambio pedido por la persona');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Yape •••• 4321')).toBeInTheDocument();
    expect(screen.getByText('Cuentas anteriores (1)')).toBeInTheDocument();
    expect(users.registrations.at(-1)).toMatchObject({
      form: { kind: 'wallet', provider: 'yape', phone: '987654321' },
    });
  });

  it('Soporte ve la cuenta pero no la registra; un error del backend se muestra', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    renderApp({ path: `/users/${rosa.userId}`, auth: signedIn(['support']), users });
    expect(await screen.findByText('Sin cuenta de cobro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar cuenta' })).not.toBeInTheDocument();
  });

  it('si el backend pide autenticación reciente, ofrece volver a iniciar sesión', async () => {
    const rosa = person();
    const users = new InMemoryUsers([rosa]);
    jest
      .spyOn(users, 'registerPayoutAccount')
      .mockRejectedValueOnce(new AppError('step_up_required', 'Vuelve a autenticarte'));
    const { user } = renderApp({
      path: `/users/${rosa.userId}`,
      auth: signedIn(['operations']),
      users,
    });
    await user.click(await screen.findByRole('button', { name: 'Registrar cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar la cuenta de cobro' });
    await user.selectOptions(within(dialog).getByLabelText('Banco'), '002');
    await user.type(within(dialog).getByLabelText('CCI'), BCP_CCI);
    await user.type(within(dialog).getByLabelText('Titular'), 'Rosa Quispe');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Constancia');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(
      await within(dialog).findByRole('button', { name: 'Volver a iniciar sesión' }),
    ).toBeInTheDocument();
  });
});
