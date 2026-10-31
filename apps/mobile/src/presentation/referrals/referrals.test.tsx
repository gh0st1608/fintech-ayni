import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryReferralRepository } from '@/infrastructure/referrals/InMemoryReferralRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { ReferFriendScreen } from './screens/ReferFriendScreen';

const referrals = (options = {}) =>
  new InMemoryReferralRepository({ latencyMs: 0, currency: 'PEN', ...options });

describe('ReferFriendScreen (COPAYNI-51)', () => {
  it('muestra el beneficio, los 3 pasos y el código; copia el código', async () => {
    const setup = createTestContainer();
    await renderWithProviders(<ReferFriendScreen />, setup);
    expect(await screen.findByText(/Difunde Ayni y obtén .*150.* de descuento/)).toBeTruthy();
    for (const step of [1, 2, 3]) expect(screen.getByTestId(`referral-step-${step}`)).toBeTruthy();
    expect(screen.getByTestId('referral-code')).toHaveTextContent(/K7M2Q9XA/);

    await fireEvent.press(screen.getByRole('button', { name: 'Copiar código K7M2Q9XA' }));
    expect(await screen.findByTestId('referral-copied')).toHaveTextContent('Código copiado.');
    expect(setup.adapters.clipboard.text).toBe('K7M2Q9XA');
  });

  it('comparte un mensaje traducido con el código y el enlace', async () => {
    const setup = createTestContainer();
    await renderWithProviders(<ReferFriendScreen />, setup);
    await fireEvent.press(await screen.findByRole('button', { name: 'Compartir invitación' }));
    await waitFor(() => expect(setup.adapters.sharer.messages).toHaveLength(1));
    expect(setup.adapters.sharer.messages[0]).toMatch(
      /^Únete a Ayni con mi código K7M2Q9XA y recibe .*150.* de descuento.*\nayni:\/\/invite\?code=K7M2Q9XA$/,
    );
  });

  it('un fallo al cargar el código se puede reintentar', async () => {
    const repository = referrals();
    const failing = jest
      .spyOn(repository, 'getMine')
      .mockRejectedValue(new AppError('network', 'offline'));
    await renderWithProviders(
      <ReferFriendScreen />,
      createTestContainer({ referrals: repository }),
    );
    expect(await screen.findByText(/No hay conexión/, {}, { timeout: 5000 })).toBeTruthy();

    failing.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('referral-code')).toBeTruthy();
  }, 10_000);
});

describe('MyReferralsSheet (COPAYNI-52)', () => {
  it('"Ver mis invitaciones" muestra ganado, canjeado, saldo y los invitados con su estado', async () => {
    await renderWithProviders(
      <ReferFriendScreen />,
      createTestContainer({ referrals: referrals({ redeemed: 5000 }) }),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver mis invitaciones' }));

    expect(await screen.findByTestId('referrals-earned')).toHaveTextContent(/Ganado.*150/);
    expect(screen.getByTestId('referrals-redeemed')).toHaveTextContent(/Canjeado.*50/);
    expect(screen.getByTestId('referrals-balance')).toHaveTextContent(/Saldo.*100/);
    expect(screen.getByText(/se aplicará automáticamente/)).toBeTruthy();
    expect(screen.getByText(/obtienes .*150.* de descuento en tu próxima cuota/)).toBeTruthy();

    const rows = screen.getAllByTestId('invitee');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Pagó su primera cuota')).toBeTruthy();
    expect(within(rows[1]!).getByText("Se unió a un Game'ya")).toBeTruthy();
    expect(within(rows[2]!).getByText('Registrado')).toBeTruthy();
  });

  it('sin invitados muestra el estado vacío; la X cierra la hoja', async () => {
    await renderWithProviders(
      <ReferFriendScreen />,
      createTestContainer({ referrals: referrals({ invitees: [] }) }),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver mis invitaciones' }));
    expect(await screen.findByTestId('invitees-empty')).toHaveTextContent(
      /Aún no has invitado amigos/,
    );

    await fireEvent.press(screen.getAllByRole('button', { name: 'Cerrar mis referidos' })[0]!);
    await waitFor(() => expect(screen.queryByTestId('referrals-summary')).toBeNull());
  });
});
