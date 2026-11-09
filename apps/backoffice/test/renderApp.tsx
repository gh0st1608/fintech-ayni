import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { createContainer } from '@/bootstrap/container';
import type {
  CirclesRepositoryPort,
  KycRepositoryPort,
  StaffAuthPort,
  UsersRepositoryPort,
  FinanceRepositoryPort,
} from '@/domain/ports';
import { AppProviders } from '@/presentation/providers/AppProviders';
import { routes } from '@/presentation/routes/routes';

import {
  InMemoryCircles,
  InMemoryFinance,
  InMemoryKyc,
  InMemoryStaffAuth,
  InMemoryUsers,
} from './fakes';

interface Options {
  path?: string;
  auth?: StaffAuthPort;
  circles?: CirclesRepositoryPort;
  kyc?: KycRepositoryPort;
  users?: UsersRepositoryPort;
  finance?: FinanceRepositoryPort;
}

/** La app completa con dobles de los puertos y un router en memoria. */
export function renderApp({
  path = '/',
  auth = new InMemoryStaffAuth(),
  circles = new InMemoryCircles(),
  kyc = new InMemoryKyc(),
  users = new InMemoryUsers(),
  finance = new InMemoryFinance(),
}: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <AppProviders
      container={createContainer({ auth, circles, kyc, users, finance })}
      queryClient={queryClient}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user, auth, circles, kyc, users, finance };
}
