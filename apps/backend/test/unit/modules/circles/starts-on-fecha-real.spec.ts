import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { RecommendedCirclesResponse } from '@src/modules/circles/presentation/http/dto/recommended-circles.dto';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number): Money => Money.of(amount, 'PEN');
const nov = Period.of(2026, 11);
const day = (value: string) => LocalDate.parse(value);

/** El jueves 12 de noviembre de 2026, el caso del criterio del ticket. */
const JUEVES = day('2026-11-12');

const recommended = (terms: CircleTerms) =>
  RecommendedCirclesResponse.from([
    { circleId: 'c-1', terms, adminFee: pen(1_000), availableSlots: 2, vacancies: [] },
  ]).items[0]!;

describe('startsOn como fecha real (COPAYNI-106)', () => {
  it('admite un mes como inicio y lo entiende como su día 1', () => {
    // Es el día en que empiezan todos los círculos creados hasta ahora, y la base de datos lo
    // garantiza con CHECK (extract(day FROM starts_on) = 1): la conversión no inventa nada.
    const terms = CircleTerms.create({ payout: pen(1_200_000), turns: 12, startsOn: nov });

    expect(terms.startsOn.toString()).toBe('2026-11-01');
    expect(terms.startsOnPeriod.toString()).toBe('2026-11');
  });

  it('conserva el día cuando el inicio es una fecha real', () => {
    const terms = CircleTerms.create({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: JUEVES,
    });

    expect(terms.startsOn.toString()).toBe('2026-11-12');
    expect(terms.startsOnPeriod.toString()).toBe('2026-11');
  });

  it('una junta semanal que empieza un jueves vence los jueves', () => {
    const terms = CircleTerms.create({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: JUEVES,
    });
    const schedule = new TurnSchedule(terms.startsOn, terms.cadence, terms.turns);

    expect(schedule.all().map(({ dueOn }) => dueOn.toString())).toEqual([
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
      '2026-12-03',
    ]);
    // El cuarto turno se sale de noviembre. Anclando en el día 1, como se hacía antes de este
    // ticket, los cuatro habrían caído en noviembre: la fecha de arranque sí cambia el resultado.
    expect(terms.payoutPeriodOf(4).toString()).toBe('2026-12');
    expect(terms.endsOn.toString()).toBe('2026-12');
  });

  it('el cronograma mensual proyecta exactamente igual que antes', () => {
    const terms = CircleTerms.create({ payout: pen(2_400_000), turns: 12, startsOn: nov });

    for (let position = 1; position <= 12; position += 1) {
      expect(terms.payoutPeriodOf(position).toString()).toBe(
        nov.addMonths(position - 1).toString(),
      );
    }
    expect(terms.endsOn.toString()).toBe('2027-10');
  });

  it('un círculo mensual sigue devolviendo startsOn como YYYY-MM, con el mismo valor', () => {
    const terms = CircleTerms.create({ payout: pen(1_200_000), turns: 12, startsOn: nov });

    const item = recommended(terms);

    expect(item.startsOn).toBe('2026-11');
    expect(typeof item.startsOn).toBe('string');
    expect(item.startsOnDate).toBe('2026-11-01');
    // Ningún campo del contrato desaparece ni cambia de forma.
    expect(Object.keys(item).sort()).toEqual([
      'adminFee',
      'availableSlots',
      'baseInstallment',
      'circleId',
      'endsOn',
      'months',
      'payout',
      'startsOn',
      'startsOnDate',
      'vacancies',
    ]);
  });

  it('una junta semanal expone la fecha completa, y startsOn solo da su mes', () => {
    const terms = CircleTerms.create({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: JUEVES,
    });

    const item = recommended(terms);

    expect(item.startsOnDate).toBe('2026-11-12');
    expect(item.startsOn).toBe('2026-11');
  });

  it('los informes por mes siguen trabajando sobre Period', () => {
    const terms = CircleTerms.create({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: JUEVES,
    });

    expect(terms.startsOnPeriod).toBeInstanceOf(Period);
    expect(terms.startsOnPeriod.monthsUntil(Period.of(2027, 1))).toBe(2);
  });
});
