import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { StartProposal } from '@/domain/circles/StartProposal';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { CirclesScreen } from './screens/CirclesScreen';

const pen = (amount: number) => Money.of(amount, 'PEN');

const PROPOSAL: StartProposal = {
  circleId: 'c-1',
  current: { payout: pen(3_000_000), baseInstallment: pen(300_000), months: 10 },
  proposed: { payout: pen(2_100_000), baseInstallment: pen(300_000), months: 7 },
  position: 3,
  netPayout: pen(2_100_000),
  firstInstallment: pen(340_000),
  totalPaid: pen(2_300_000),
  respondBy: '2026-11-09',
  decision: null,
};

function setup(proposals: StartProposal[] = [PROPOSAL]) {
  const circleMembership = new InMemoryCircleMembershipRepository({
    latencyMs: 0,
    startProposals: proposals,
  });
  return { circleMembership, ...createTestContainer({ circleMembership }) };
}

const render = (container: ReturnType<typeof setup>) =>
  renderWithProviders(<CirclesScreen onJoin={jest.fn()} onJoinCircle={jest.fn()} />, container);

describe('StartProposals (COPAYNI-62)', () => {
  it('muestra el pozo, la cuota y el turno nuevos', async () => {
    await render(setup());
    expect(await screen.findByText('Tu círculo empezará reducido')).toBeOnTheScreen();
    const card = screen.getByTestId('start-proposal-c-1');
    expect(card).toHaveTextContent(/Pozo.*21.?000/);
    expect(card).toHaveTextContent(/Integrantes.*7/);
    expect(card).toHaveTextContent(/Tu turno.*3/);
    expect(card).toHaveTextContent(/Tu cuota.*3.?400/);
    expect(card).toHaveTextContent(/Responde hasta el 9/);
  });

  it('sin propuestas no muestra nada', async () => {
    await render(setup([]));
    await screen.findByTestId('circles-tabs');
    expect(screen.queryByText('Tu círculo empezará reducido')).toBeNull();
  });

  it('acepta y deja ver la respuesta', async () => {
    const container = setup();
    await render(container);
    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));
    await waitFor(() =>
      expect(screen.getByTestId('start-proposal-decision')).toHaveTextContent('Aceptaste.'),
    );
    expect(container.circleMembership.startProposals[0]?.decision).toBe('accepted');
  });

  it('se puede retirar', async () => {
    const container = setup();
    await render(container);
    await fireEvent.press(await screen.findByRole('button', { name: 'Retirarme' }));
    await waitFor(() =>
      expect(container.circleMembership.startProposals[0]?.decision).toBe('withdrawn'),
    );
  });

  it('avisa si no pudo guardar la respuesta', async () => {
    const container = setup();
    jest
      .spyOn(container.circleMembership, 'respondStartProposal')
      .mockRejectedValue(new AppError('business', 'x', { code: 'START_PROPOSAL_EXPIRED' }));
    await render(container);
    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
  });
});
