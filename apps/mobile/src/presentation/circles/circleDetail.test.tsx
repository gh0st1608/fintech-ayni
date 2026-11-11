import { fireEvent, screen } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { myCircle } from '@test/fakes/myCircles';
import { renderWithProviders } from '@test/renderWithProviders';

import { CircleDetailScreen } from './screens/CircleDetailScreen';
import { CirclesScreen } from './screens/CirclesScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

/** 30.000 en 6 meses desde noviembre de 2026; en enero de 2027 va en el mes 3. */
const membership = (options: { currentPeriod?: string } = {}) =>
  new InMemoryCircleMembershipRepository({
    latencyMs: 0,
    circles: [myCircle()],
    currentPeriod: options.currentPeriod ?? '2027-01',
  });

async function renderDetail(circleMembership = membership(), circleId = 'c-1') {
  const onPay = jest.fn();
  await renderWithProviders(
    <CircleDetailScreen circleId={circleId} onPay={onPay} />,
    createTestContainer({ circleMembership }),
  );
  return { onPay, circleMembership };
}

describe('Detalle de mi junta (D8, COPAYNI-88)', () => {
  it('muestra el pozo, el avance, mi turno y mi cuota del mes', async () => {
    await renderDetail();
    const summary = await screen.findByTestId('circle-detail-summary');
    expect(summary).toHaveTextContent(/Pozo mensual.*Activa/);
    expect(summary).toHaveTextContent(/30\.?000/);
    expect(screen.getByTestId('circle-detail-progress')).toHaveTextContent(
      /Mes 3 de 6 · termina en abr\.? 2027/i,
    );
    expect(screen.getByRole('progressbar', { name: 'Avance de la junta' })).toHaveProp(
      'accessibilityValue',
      { min: 0, max: 6, now: 3 },
    );
    const mine = screen.getByTestId('circle-detail-mine');
    expect(mine).toHaveTextContent(/Tu turno.*ene\.? 2027 \(3\.º\)/i);
    expect(mine).toHaveTextContent(/Tu cuota.*5\.?600/);
    expect(mine).toHaveTextContent(/Próximo vencimiento.*Estás al día/);
  });

  it('lista los turnos: los demás abreviados, el mío como "Tú" y el estado de cada uno', async () => {
    await renderDetail();
    expect(await screen.findByTestId('circle-turn-1')).toHaveTextContent(/María R\..*Cobrado/);
    expect(screen.getByTestId('circle-turn-3')).toHaveTextContent(/ene\.? 2027 · Tú.*Este mes/i);
    expect(screen.getByTestId('circle-turn-4')).not.toHaveTextContent(/Cobrado|Este mes/);
  });

  it('con una cuota pendiente ofrece pagarla', async () => {
    const circleMembership = membership();
    const real = await circleMembership.getMine('c-1');
    jest.spyOn(circleMembership, 'getMine').mockResolvedValue({
      ...real,
      nextDue: {
        installmentId: 'i-9',
        period: '2027-01',
        dueOn: '2027-01-05',
        amount: pen(5_600),
        status: 'pending',
      },
    });
    const { onPay } = await renderDetail(circleMembership);
    expect(await screen.findByTestId('circle-detail-mine')).toHaveTextContent(
      /Próximo vencimiento.*5 ene\.? 2027/i,
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Pagar .*5\.?600/ }));
    expect(onPay).toHaveBeenCalledWith('i-9');
  });

  it('antes de empezar dice cuándo empieza', async () => {
    await renderDetail(membership({ currentPeriod: '2026-10' }));
    expect(await screen.findByTestId('circle-detail-progress')).toHaveTextContent(
      /Empieza en nov\.? 2026/i,
    );
  });

  it('un círculo que no es mío muestra el error con reintento', async () => {
    const circleMembership = membership();
    jest
      .spyOn(circleMembership, 'getMine')
      .mockRejectedValue(new AppError('not_found', 'x', { code: 'CIRCLE_NOT_FOUND' }));
    await renderDetail(circleMembership);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('desde Circles, tocar la tarjeta abre el detalle del círculo', async () => {
    const onOpenCircle = jest.fn();
    await renderWithProviders(
      <CirclesScreen onJoin={jest.fn()} onJoinCircle={jest.fn()} onOpenCircle={onOpenCircle} />,
      createTestContainer({
        circleMembership: new InMemoryCircleMembershipRepository({
          latencyMs: 0,
          circles: [myCircle({ startsOn: '2090-01', endsOn: '2090-06', payoutPeriod: '2090-03' })],
        }),
        circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0 }),
      }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: /Ver el detalle de la junta de .*30\.?000/ }),
    );
    expect(onOpenCircle).toHaveBeenCalledWith('c-1');
  });
});
