import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import {
  CircleTerms,
  MIN_CIRCLE_TURNS,
} from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number): Money => Money.of(amount, 'PEN');
const nov = Period.of(2026, 11);

const terms = (props: Parameters<typeof CircleTerms.create>[0]) => CircleTerms.create(props);

describe('CircleTerms con turnos y cadencia (COPAYNI-105)', () => {
  it('sin indicar cadencia asume mensual, para no cambiar los círculos existentes', () => {
    const circle = terms({ payout: pen(2_400_000), turns: 12, startsOn: nov });

    expect(circle.cadence.equals(Cadence.monthly)).toBe(true);
    expect(circle.turns).toBe(12);
    expect(circle.baseInstallment.amount).toBe(200_000);
  });

  it('acepta months como nombre anterior de turns y significa lo mismo', () => {
    const conMonths = terms({ payout: pen(2_400_000), months: 12, startsOn: nov });
    const conTurns = terms({ payout: pen(2_400_000), turns: 12, startsOn: nov });

    expect(conMonths.turns).toBe(conTurns.turns);
    expect(conMonths.months).toBe(12);
    expect(conMonths.baseInstallment.amount).toBe(conTurns.baseInstallment.amount);
  });

  it('el getter months devuelve el número de turnos en cualquier cadencia', () => {
    // Es lo que esperan los ~60 sitios que leen `months` para saber cuántos puestos hay.
    for (const cadence of Cadence.all()) {
      expect(terms({ payout: pen(2_400_000), turns: 10, cadence, startsOn: nov }).months).toBe(10);
    }
  });

  it('distingue el número de turnos de la duración en meses', () => {
    const mensual = terms({ payout: pen(1_200_000), turns: 4, startsOn: nov });
    const semanal = terms({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: nov,
    });
    const quincenal = terms({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.biweekly,
      startsOn: nov,
    });

    expect(mensual.durationInMonths).toBe(4);
    // 4 turnos semanales son 28 días: menos de un mes, no "un mes".
    expect(semanal.durationInMonths).toBeCloseTo(0.92, 2);
    // 4 quincenales son 56 días: no son dos meses exactos.
    expect(quincenal.durationInMonths).toBeCloseTo(1.84, 2);
  });

  it('el cronograma mensual es idéntico al que daba antes de la cadencia', () => {
    const circle = terms({ payout: pen(2_400_000), turns: 12, startsOn: nov });

    for (let position = 1; position <= 12; position += 1) {
      expect(circle.payoutPeriodOf(position).toString()).toBe(
        nov.addMonths(position - 1).toString(),
      );
    }
    expect(circle.endsOn.toString()).toBe(nov.addMonths(11).toString());
  });

  it('en cadencia semanal varios turnos caen en el mismo mes', () => {
    const circle = terms({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: nov,
    });
    const periods = [1, 2, 3, 4].map((position) => circle.payoutPeriodOf(position).toString());

    // El mes deja de identificar un turno: es la razón de ser de TurnSchedule.
    expect(new Set(periods).size).toBeLessThan(4);
    expect(periods[0]).toBe('2026-11');
  });

  it('delega el cronograma, y con ello rechaza un turno fuera del círculo', () => {
    // La aritmética vive en TurnSchedule, que acota el ordinal. Antes un turno inexistente
    // devolvía un mes cualquiera en silencio.
    const circle = terms({ payout: pen(1_200_000), turns: 4, startsOn: nov });

    expect(() => circle.payoutPeriodOf(0)).toThrow(
      expect.objectContaining({ code: 'INVALID_TURN' }),
    );
    expect(() => circle.payoutPeriodOf(5)).toThrow(
      expect.objectContaining({ code: 'INVALID_TURN' }),
    );
  });

  it('la cuota base se reparte por turnos y no por meses', () => {
    const semanal = terms({
      payout: pen(1_200_000),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: nov,
    });

    expect(semanal.baseInstallment.amount).toBe(300_000);
    expect(semanal.baseInstallment.amount * semanal.turns).toBe(semanal.payout.amount);
  });

  it('exige cuota exacta sobre los turnos, en cualquier cadencia', () => {
    expect(CircleTerms.divides(pen(1_200_000), 4)).toBe(true);
    expect(CircleTerms.divides(pen(1_200_000), 7)).toBe(false);

    expect(() =>
      terms({ payout: pen(1_200_000), turns: 7, cadence: Cadence.weekly, startsOn: nov }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }));
  });

  it('una junta mensual arranca el día 1, y las demás cualquier día (COPAYNI-108)', () => {
    // La invariante que imponía la base con `CHECK (extract(day FROM starts_on) = 1)` y que la
    // expansión retiró (COPAYNI-107), ahora en el dominio y condicionada a la cadencia: la base
    // no sabe de cadencias, y mantenerla allí prohibía las juntas semanales.
    expect(terms({ payout: pen(1_200_000), turns: 4, startsOn: nov }).startsOn.toString()).toBe(
      '2026-11-01',
    );
    expect(() =>
      terms({ payout: pen(1_200_000), turns: 4, startsOn: LocalDate.parse('2026-11-15') }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }));

    // Fuera de la cadencia mensual el día de arranque es el del cronograma, y vale cualquiera.
    for (const cadence of [Cadence.weekly, Cadence.biweekly]) {
      const circle = terms({
        payout: pen(1_200_000),
        turns: 4,
        cadence,
        startsOn: LocalDate.parse('2026-11-15'),
      });
      expect(circle.startsOn.toString()).toBe('2026-11-15');
    }
  });

  it('en cadencia mensual el mes nombra el turno, que es lo que protege el día 1', () => {
    // El turno se deriva del mes al restaurar un ciclo y en el backfill de la expansión. La
    // cuenta solo cuadra si el arranque es el día 1: con el 20 de noviembre, el turno 1 caería
    // en noviembre y el turno 2 en diciembre, pero el mes de arranque seguiría siendo noviembre,
    // y un mes de más o de menos desplaza a quién le toca cobrar.
    const circle = terms({ payout: pen(1_200_000), turns: 4, startsOn: nov });

    for (let turn = 1; turn <= 4; turn += 1) {
      const period = circle.payoutPeriodOf(turn);
      expect(circle.startsOnPeriod.monthsUntil(period) + 1).toBe(turn);
    }
  });

  it('la divisibilidad depende del número de turnos, no de la cadencia (COPAYNI-113)', () => {
    // La regla es `payout % turnos === 0`, sin consultar la cadencia: el mismo monto y los
    // mismos turnos dan la misma respuesta en las tres.
    for (const cadence of Cadence.all()) {
      expect(() => terms({ payout: pen(1_200_000), turns: 7, cadence, startsOn: nov })).toThrow(
        expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }),
      );
      expect(terms({ payout: pen(1_200_000), turns: 8, cadence, startsOn: nov }).turns).toBe(8);
    }
  });

  it('rechaza menos turnos que el mínimo, y falta de turnos', () => {
    expect(MIN_CIRCLE_TURNS).toBe(2);

    expect(() => terms({ payout: pen(1_200_000), turns: 1, startsOn: nov })).toThrow(
      expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }),
    );
    expect(() => terms({ payout: pen(1_200_000), startsOn: nov })).toThrow(
      expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }),
    );
    expect(() => terms({ payout: pen(0), turns: 4, startsOn: nov })).toThrow(
      expect.objectContaining({ code: 'INVALID_CIRCLE_TERMS' }),
    );
  });
});
