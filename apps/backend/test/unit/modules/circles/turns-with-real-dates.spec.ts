import { type MyCircleCalendar } from '@src/modules/circles/application/ports/my-circle-calendar.port';
import { type PaymentsQueryPort } from '@src/modules/circles/application/ports/payments-query.port';
import { GetMyCircleUseCase } from '@src/modules/circles/application/use-cases/get-my-circle.use-case';
import { Circle, type Membership } from '@src/modules/circles/domain/entities/circle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { MyCircleDetailResponse } from '@src/modules/circles/presentation/http/dto/my-circle-detail.dto';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { TEST_PRICING } from '@test/support/join-circle.fixture';

/**
 * Cada turno con su fecha real en el detalle del círculo (COPAYNI-117).
 *
 * COPAYNI-88 etiquetaba los turnos por mes, porque el dominio solo sabía de meses. Con cadencias
 * eso se rompe de dos formas, y las dos se arreglan aquí:
 *
 * - **La etiqueta**: en una junta semanal hay cuatro o cinco turnos en el mismo mes, así que
 *   «marzo» no identifica ninguno. El turno pasa a identificarse por su ordinal y su fecha real.
 * - **El estado**: los turnos cobrados se marcaban comparando meses. En semanal, cobrar el turno
 *   1 marcaba como cobrados los cuatro turnos de ese mes, con la pantalla diciéndole a cuatro
 *   personas que ya les pagaron.
 *
 * La fecha la calcula el servidor con `TurnSchedule`, que es el único sitio con aritmética de
 * calendario de la junta: el cliente la muestra tal cual y no deriva nada de los meses.
 */
const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'u-4', subject: 'u-4', roles: [] } as never;

/** 12.000 en 4 turnos semanales desde el miércoles 4 de noviembre: los cuatro en noviembre. */
const WEEKLY = CircleTerms.create({
  payout: pen(12_000),
  turns: 4,
  cadence: Cadence.weekly,
  startsOn: LocalDate.parse('2026-11-04'),
});

/** 30.000 en 10 turnos mensuales desde noviembre, como las juntas que ya existen. */
const MONTHLY = CircleTerms.create({
  payout: pen(30_000),
  turns: 10,
  startsOn: Period.of(2026, 11),
});

function setup(terms: CircleTerms, calendar: Partial<MyCircleCalendar> = {}) {
  const circles = new InMemoryCircleRepository();
  const positions = Array.from({ length: terms.turns }, (_unused, index) => index + 1);
  const memberships: Membership[] = positions.map((position) => ({
    userId: `u-${position}`,
    position,
    idempotencyKey: `key-u-${position}-000000`,
    price: priceOf(TEST_PRICING.quote(terms, position)),
  }));
  circles.add(Circle.restore({ id: 'c-1', terms, memberships, running: { vacancies: [] } }));
  const payments = {
    dueInstallmentsOf: () => Promise.resolve([]),
  } as unknown as PaymentsQueryPort;

  return new GetMyCircleUseCase(
    circles,
    {
      find: () =>
        Promise.resolve({
          state: 'contributing' as const,
          currentPeriod: '2026-11',
          currentTurn: 2,
          paidTurns: [1],
          members: memberships.map(({ userId, position }) => ({
            userId,
            position,
            firstName: `Socio${position}`,
            lastName: null,
          })),
          ...calendar,
        }),
    },
    payments,
    TEST_PRICING,
  );
}

describe('Turnos con su fecha real (COPAYNI-117)', () => {
  it('en una junta semanal cada turno trae su día, y ninguno repite etiqueta', async () => {
    const detail = await setup(WEEKLY).execute(ANA, 'c-1');

    expect(detail.turns.map(({ turn, payoutOn }) => [turn, payoutOn.toString()])).toEqual([
      [1, '2026-11-04'],
      [2, '2026-11-11'],
      [3, '2026-11-18'],
      [4, '2026-11-25'],
    ]);
    // Los cuatro caen en el mismo mes: por eso el mes no puede ser la etiqueta.
    expect(new Set(detail.turns.map(({ period }) => period.toString()))).toEqual(
      new Set(['2026-11']),
    );
    expect(new Set(detail.turns.map(({ payoutOn }) => payoutOn.toString())).size).toBe(4);
  });

  it('la fecha es la que calcula el cronograma del servidor, turno por turno', async () => {
    const schedule = new TurnSchedule(WEEKLY.startsOn, WEEKLY.cadence, WEEKLY.turns);
    const detail = await setup(WEEKLY).execute(ANA, 'c-1');

    for (const { turn, payoutOn } of detail.turns) {
      expect(payoutOn).toEqual(schedule.payoutOn(turn));
    }
  });

  it('solo el turno cobrado se muestra cobrado, y no los tres que comparten su mes', async () => {
    // El defecto que arregla el ticket: con el estado por mes, cobrar el turno 1 marcaba los
    // cuatro de noviembre como cobrados.
    const detail = await setup(WEEKLY).execute(ANA, 'c-1');

    expect(detail.turns.map(({ turn, status }) => [turn, status])).toEqual([
      [1, 'paid'],
      [2, 'current'],
      [3, 'upcoming'],
      [4, 'upcoming'],
    ]);
  });

  it('distingue mi turno de los demás', async () => {
    const detail = await setup(MONTHLY).execute(ANA, 'c-1');

    expect(detail.turns.filter(({ isMe }) => isMe).map(({ turn }) => turn)).toEqual([4]);
  });

  it('una junta mensual sigue mostrándose como hoy: un turno por mes', async () => {
    const detail = await setup(MONTHLY, { currentTurn: 3, paidTurns: [1, 2] }).execute(ANA, 'c-1');

    expect(detail.turns.map(({ turn, period }) => [turn, period.toString()])).toEqual([
      [1, '2026-11'],
      [2, '2026-12'],
      [3, '2027-01'],
      [4, '2027-02'],
      [5, '2027-03'],
      [6, '2027-04'],
      [7, '2027-05'],
      [8, '2027-06'],
      [9, '2027-07'],
      [10, '2027-08'],
    ]);
    // Y su fecha es el día 1, que es el día en que arrancan todas las mensuales (COPAYNI-108).
    expect(detail.turns.map(({ payoutOn }) => payoutOn.day)).toEqual(Array(10).fill(1));
    expect(detail.turns.slice(0, 2).map(({ status }) => status)).toEqual(['paid', 'paid']);
  });

  it('una junta terminada muestra sus turnos pasados con su fecha y su estado', async () => {
    const detail = await setup(WEEKLY, {
      state: 'finished',
      currentPeriod: null,
      currentTurn: null,
      paidTurns: [1, 2, 3, 4],
    }).execute(ANA, 'c-1');

    expect(detail.state).toBe('finished');
    expect(detail.currentTurn).toBeNull();
    expect(detail.turns.map(({ status }) => status)).toEqual(['paid', 'paid', 'paid', 'paid']);
    expect(detail.turns.map(({ payoutOn }) => payoutOn.toString())).toEqual([
      '2026-11-04',
      '2026-11-11',
      '2026-11-18',
      '2026-11-25',
    ]);
  });

  it('sin turno guardado solo lo deriva del mes en cadencia mensual', async () => {
    // Derivarlo del mes es lo que hacía el backfill de la expansión (COPAYNI-107), y solo
    // acierta en mensual. En semanal se prefiere no saberlo a decir un turno equivocado.
    const monthly = await setup(MONTHLY, { currentTurn: null, currentPeriod: '2027-01' }).execute(
      ANA,
      'c-1',
    );
    expect(monthly.currentTurn).toBe(3);

    const weekly = await setup(WEEKLY, { currentTurn: null, currentPeriod: '2026-11' }).execute(
      ANA,
      'c-1',
    );
    expect(weekly.currentTurn).toBeNull();
  });

  it('el contrato lleva la cadencia, su unidad y la fecha de cada turno', async () => {
    const detail = await setup(WEEKLY).execute(ANA, 'c-1');
    const response = MyCircleDetailResponse.from(detail);

    expect(response).toMatchObject({
      cadence: 'weekly',
      unit: 'Semana',
      turnCount: 4,
      currentTurn: 2,
      // El alias que lee la app publicada sigue valiendo lo mismo.
      months: 4,
      startsOnDate: '2026-11-04',
    });
    expect(response.turns.map(({ turn, payoutOn }) => [turn, payoutOn])).toEqual([
      [1, '2026-11-04'],
      [2, '2026-11-11'],
      [3, '2026-11-18'],
      [4, '2026-11-25'],
    ]);
  });
});
