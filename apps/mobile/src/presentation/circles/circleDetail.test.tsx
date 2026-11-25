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
  it('muestra el pozo, el avance, mi turno y mi cuota del turno', async () => {
    // El copy habla de turnos y de fechas reales, no de meses (COPAYNI-117, diseño aprobado).
    await renderDetail();
    const summary = await screen.findByTestId('circle-detail-summary');
    expect(summary).toHaveTextContent(/Pozo por turno.*Activa/);
    expect(summary).toHaveTextContent(/30\.?000/);
    expect(screen.getByTestId('circle-detail-progress')).toHaveTextContent(
      /Turno 3 de 6 · termina el 1 abr\.? 2027/i,
    );
    expect(screen.getByRole('progressbar', { name: 'Avance de la junta' })).toHaveProp(
      'accessibilityValue',
      { min: 0, max: 6, now: 3 },
    );
    const mine = screen.getByTestId('circle-detail-mine');
    expect(mine).toHaveTextContent(/Tu turno.*Mes 3 · 1 ene\.? 2027/i);
    expect(mine).toHaveTextContent(/Tu cuota.*5\.?600.*por mes/);
    expect(mine).toHaveTextContent(/Próximo vencimiento.*Estás al día/);
  });

  it('lista los turnos: los demás abreviados, el mío como "Tú" y el estado de cada uno', async () => {
    await renderDetail();
    expect(await screen.findByTestId('circle-turn-1')).toHaveTextContent(/María R\..*Cobrado/);
    expect(screen.getByTestId('circle-turn-3')).toHaveTextContent(
      /Mes 3 · 1 ene\.? 2027 · Tú.*En curso/i,
    );
    expect(screen.getByTestId('circle-turn-4')).toHaveTextContent(/Mes 4 · 1 feb\.? 2027/i);
    expect(screen.getByTestId('circle-turn-4')).not.toHaveTextContent(/Cobrado|En curso/);
  });

  it('en una junta semanal cada turno trae su fecha y ninguno repite etiqueta', async () => {
    // El caso que rompía el etiquetado por mes: cuatro turnos en noviembre (COPAYNI-117). La
    // pantalla muestra la fecha que calculó el servidor y no deriva nada del mes.
    const circleMembership = membership();
    const real = await circleMembership.getMine('c-1');
    jest.spyOn(circleMembership, 'getMine').mockResolvedValue({
      ...real,
      cadence: 'weekly',
      turnCount: 4,
      currentTurn: 2,
      startsOn: '2026-11',
      startsOnDate: '2026-11-04',
      endsOn: '2026-11',
      endsOnDate: '2026-11-25',
      turns: [
        {
          position: 1,
          turn: 1,
          period: '2026-11',
          payoutOn: '2026-11-04',
          memberName: 'María R.',
          isMe: false,
          status: 'paid',
        },
        {
          position: 2,
          turn: 2,
          period: '2026-11',
          payoutOn: '2026-11-11',
          memberName: 'Luis T.',
          isMe: false,
          status: 'current',
        },
        {
          position: 3,
          turn: 3,
          period: '2026-11',
          payoutOn: '2026-11-18',
          memberName: null,
          isMe: true,
          status: 'upcoming',
        },
        {
          position: 4,
          turn: 4,
          period: '2026-11',
          payoutOn: '2026-11-25',
          memberName: null,
          isMe: false,
          status: 'vacant',
        },
      ],
    });
    await renderDetail(circleMembership);

    expect(await screen.findByTestId('circle-detail-progress')).toHaveTextContent(
      /Turno 2 de 4 · termina el 25 nov\.? 2026/i,
    );
    // Cuatro etiquetas distintas aunque las cuatro caigan en el mismo mes.
    expect(screen.getByTestId('circle-turn-1')).toHaveTextContent(
      /Semana 1 · 4 nov\.? 2026 · María R\..*Cobrado/i,
    );
    expect(screen.getByTestId('circle-turn-2')).toHaveTextContent(
      /Semana 2 · 11 nov\.? 2026 · Luis T\..*En curso/i,
    );
    expect(screen.getByTestId('circle-turn-3')).toHaveTextContent(
      /Semana 3 · 18 nov\.? 2026 · Tú.*Próximo/i,
    );
    expect(screen.getByTestId('circle-turn-4')).toHaveTextContent(
      /Semana 4 · 25 nov\.? 2026.*Vacante/i,
    );
    // Y la cuota se expresa en la unidad de la cadencia.
    expect(screen.getByTestId('circle-detail-mine')).toHaveTextContent(/Tu cuota.*por semana/i);
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
      /Empieza el 1 nov\.? 2026/i,
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
