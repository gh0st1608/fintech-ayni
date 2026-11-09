import { screen, waitFor, within } from '@testing-library/react';

import { ListInstallmentsUseCase } from '@/application/usecases';
import { AppError } from '@/domain/shared/AppError';
import type { StaffRole } from '@/domain/staff/Staff';
import { FinanceApiRepository } from '@/infrastructure/api/adapters';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { TokenStore } from '@/infrastructure/http/TokenStore';
import { installment, InMemoryFinance, InMemoryStaffAuth, NOW } from '@test/fakes';
import { renderApp } from '@test/renderApp';

function signedIn(roles: StaffRole[]) {
  const auth = new InMemoryStaffAuth();
  auth.staff = {
    staffId: 'dev:finanzas@ayni.local',
    email: 'finanzas@ayni.local',
    roles,
    authenticatedAt: NOW,
  };
  return auth;
}

describe('finanzas: cuotas', () => {
  it('muestra los totales por estado y filtra por estado y mes desde la URL', async () => {
    const finance = new InMemoryFinance([
      installment({ status: 'overdue' }),
      installment({ status: 'paid', paidAt: NOW, position: 1 }),
      installment({ status: 'paid', period: '2027-01', dueOn: '2027-01-01' }),
    ]);
    const { user, router } = renderApp({ path: '/finance', auth: signedIn(['finance']), finance });

    const totals = await screen.findByRole('list', { name: 'Totales por estado' });
    expect(within(totals).getByText('Pagada')).toBeInTheDocument();
    expect(within(totals).getByText('2 cuotas')).toBeInTheDocument();
    expect(screen.getAllByText('Lucía M.')).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText('Estado'), 'overdue');
    await waitFor(() => expect(screen.getAllByText('Lucía M.')).toHaveLength(1));
    expect(router.state.location.search).toBe('?status=overdue');

    await user.selectOptions(screen.getByLabelText('Estado'), '');
    await user.type(screen.getByLabelText('Mes'), '2027-01');
    await waitFor(() => expect(finance.requests.at(-1)).toMatchObject({ period: '2027-01' }));
    // Soporte de juntas: el turno enlaza al detalle de la junta.
    expect(screen.getAllByRole('link', { name: /turno/ })[0]).toHaveAttribute(
      'href',
      '/circles/00000000-0000-4000-8000-000000000042',
    );
  });

  it('un mes inválido en la URL se ignora; sin cuotas lo dice', async () => {
    const finance = new InMemoryFinance();
    renderApp({ path: '/finance?period=2026-13', auth: signedIn(['super_admin']), finance });
    expect(await screen.findByText('No hay cuotas con estos filtros')).toBeInTheDocument();
    expect(finance.requests[0]?.period).toBeUndefined();
  });

  it('pagina con "Cargar más" y si falla permite reintentar', async () => {
    const finance = new InMemoryFinance([installment(), installment(), installment()]);
    finance.pageSize = 2;
    const failing = jest
      .spyOn(finance, 'installments')
      .mockRejectedValueOnce(new AppError('server', 'falla', undefined, 'trace-fin'));
    const { user } = renderApp({ path: '/finance', auth: signedIn(['finance']), finance });
    expect(await screen.findByText(/trace-fin/)).toBeInTheDocument();
    failing.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByText('Lucía M.')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByText('Lucía M.')).toHaveLength(3));
  });

  it('el caso de uso rechaza un mes con otra forma', () => {
    expect(() =>
      new ListInstallmentsUseCase(new InMemoryFinance()).execute({ period: '12-2026' }),
    ).toThrow('AAAA-MM');
  });
});

describe('finanzas: pozos y fondo', () => {
  it('lista los pozos entregados', async () => {
    const finance = new InMemoryFinance([], {
      items: [
        {
          id: '00000000-0000-4000-c000-000000000001',
          circleId: '00000000-0000-4000-8000-000000000042',
          position: 1,
          period: '2026-12',
          amount: { amount: 600_000, currency: 'PEN' },
          disbursedAt: NOW,
          member: { userId: '11111111-1111-4111-8111-111111111111', name: 'Lucía M.' },
        },
      ],
      nextCursor: null,
    });
    renderApp({ path: '/finance?view=payouts', auth: signedIn(['finance']), finance });
    expect(await screen.findByText(/6,000\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pozos entregados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sin pozos lo dice', async () => {
    renderApp({ path: '/finance?view=payouts', auth: signedIn(['finance']) });
    expect(await screen.findByText('Todavía no se entregó ningún pozo')).toBeInTheDocument();
  });

  it('el fondo muestra el saldo, avisa si está bajo el mínimo y lista los movimientos', async () => {
    const finance = new InMemoryFinance([], undefined, {
      balances: [
        {
          balance: { amount: 50_000, currency: 'PEN' },
          activeCircles: 1,
          minimum: { amount: 200_000, currency: 'PEN' },
          belowMinimum: true,
        },
      ],
      items: [
        {
          transactionKey: 'seed:1',
          kind: 'seed_capital',
          circleId: null,
          period: null,
          reason: 'Aporte inicial',
          amount: { amount: 50_000, currency: 'PEN' },
          createdAt: NOW,
        },
        {
          transactionKey: 'cov:1',
          kind: 'coverage',
          circleId: '00000000-0000-4000-8000-000000000042',
          period: '2026-12',
          reason: null,
          amount: { amount: -10_000, currency: 'PEN' },
          createdAt: NOW,
        },
      ],
      nextCursor: null,
    });
    const { user } = renderApp({ path: '/finance', auth: signedIn(['super_admin']), finance });
    await user.click(await screen.findByRole('button', { name: 'Fondo de garantía' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Por debajo del mínimo');
    expect(screen.getByText('Capital semilla')).toBeInTheDocument();
    expect(screen.getByText('Aporte inicial')).toBeInTheDocument();
    expect(screen.getByText('Cobertura de una cuota')).toBeInTheDocument();
  });

  it('un fondo vacío lo explica', async () => {
    renderApp({ path: '/finance?view=fund', auth: signedIn(['finance']) });
    expect(
      await screen.findByText('El fondo todavía no tiene saldo ni juntas en curso'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos')).toBeInTheDocument();
  });

  it('soporte y operaciones no ven finanzas', async () => {
    renderApp({ path: '/finance', auth: signedIn(['support', 'operations']) });
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Finanzas' })).not.toBeInTheDocument();
  });
});

describe('FinanceApiRepository', () => {
  it('arma los filtros en la URL y valida los contratos', async () => {
    const calls: string[] = [];
    const replies: unknown[] = [
      { totals: [], items: [], nextCursor: null },
      { items: [], nextCursor: null },
      { balances: [], items: [], nextCursor: null },
    ];
    const fetchFn = jest.fn((url: URL | RequestInfo) => {
      calls.push(url instanceof URL ? url.href : typeof url === 'string' ? url : url.url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: replies.shift(), traceId: 't' }),
      } as Response);
    }) as unknown as typeof fetch;
    const repository = new FinanceApiRepository(
      new FetchHttpClient('http://api.test', new TokenStore(), 5_000, fetchFn),
    );
    await repository.installments({ status: 'overdue', period: '2026-12', cursor: 'c', limit: 5 });
    await repository.payouts({});
    await repository.guaranteeFund({ limit: 10 });
    expect(calls).toEqual([
      'http://api.test/admin/v1/finance/installments?status=overdue&period=2026-12&cursor=c&limit=5',
      'http://api.test/admin/v1/finance/payouts',
      'http://api.test/admin/v1/finance/guarantee-fund?limit=10',
    ]);
  });
});
