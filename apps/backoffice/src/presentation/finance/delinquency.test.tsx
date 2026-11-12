import { screen, waitFor, within } from '@testing-library/react';

import type { DelinquencyItem } from '@/domain/finance/Delinquency';
import type { StaffRole } from '@/domain/staff/Staff';
import { InMemoryFinance, InMemoryStaffAuth, NOW } from '@test/fakes';
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

const item = (overrides: Partial<DelinquencyItem> = {}): DelinquencyItem => ({
  id: '00000000-0000-4000-a000-000000000001',
  circleId: '00000000-0000-4000-b000-000000000001',
  member: { userId: '00000000-0000-4000-c000-000000000001', name: 'Rosa Q.' },
  period: '2026-12',
  date: '2026-12-01',
  amount: { amount: 100_000, currency: 'PEN' },
  lateFee: null,
  settledAt: null,
  graceEndsOn: '2026-12-04',
  ...overrides,
});

function finance() {
  const repository = new InMemoryFinance();
  repository.delinquencyPages = {
    grace: { items: [item()], nextCursor: null, pending: [{ amount: 100_000, currency: 'PEN' }] },
    debts: {
      items: [
        item({
          id: '00000000-0000-4000-a000-000000000002',
          member: { userId: '00000000-0000-4000-c000-000000000002', name: 'Luis Q.' },
          lateFee: { amount: 5_000, currency: 'PEN' },
          graceEndsOn: null,
          settledAt: NOW,
        }),
      ],
      nextCursor: null,
      pending: [],
    },
  };
  return repository;
}

describe('mora (COPAYNI-94)', () => {
  it('muestra quién está en gracia con lo pendiente y cambia de vista desde la URL', async () => {
    const repository = finance();
    const { user, router } = renderApp({
      path: '/delinquency',
      auth: signedIn(['operations']),
      finance: repository,
    });

    const table = await screen.findByRole('table', { name: 'En gracia' });
    expect(within(table).getByText('Rosa Q.')).toBeInTheDocument();
    expect(within(table).getByText(/Gracia hasta/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pendiente' })).toHaveTextContent(/1,000\.00/);

    await user.click(screen.getByRole('button', { name: 'Deudas' }));
    const debts = await screen.findByRole('table', { name: 'Deudas' });
    expect(within(debts).getByText('Luis Q.')).toBeInTheDocument();
    expect(within(debts).getByText(/Saldada el/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?view=debts');
    expect(repository.delinquencyRequests.map(({ view }) => view)).toEqual(['grace', 'debts']);
  });

  it('una vista vacía lo dice', async () => {
    renderApp({
      path: '/delinquency?view=refunds',
      auth: signedIn(['finance']),
      finance: finance(),
    });
    expect(await screen.findByText('No hay nadie en esta vista')).toBeInTheDocument();
  });

  it('soporte no tiene acceso a la mora', async () => {
    renderApp({ path: '/delinquency', auth: signedIn(['support']), finance: finance() });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Mora' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Mora' })).not.toBeInTheDocument();
  });
});
