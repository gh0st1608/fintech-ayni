import { DomainError } from '../../../../shared/errors/app-error';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { TurnSchedule } from '../services/turn-schedule';
import { Cadence } from './cadence';

export class InvalidCircleTermsError extends DomainError {
  constructor(message: string) {
    super('INVALID_CIRCLE_TERMS', message);
  }
}

/** Un círculo necesita al menos dos miembros para que haya a quién pagarle cada turno. */
export const MIN_CIRCLE_TURNS = 2;

/** @deprecated Usar `MIN_CIRCLE_TURNS`: el mínimo es de turnos, no de meses. */
export const MIN_CIRCLE_MONTHS = MIN_CIRCLE_TURNS;

/**
 * Condiciones de un Game'ya: cada turno se paga `payout` a un miembro, durante `turns` turnos
 * desde la fecha `startsOn`, con la frecuencia que indique `cadence`. Hay tantos miembros como turnos
 * (un slot por turno) y la cuota base es `payout / turns`.
 *
 * El turno es un **ordinal**, no un mes (COPAYNI-100). Antes ambas cosas coincidían porque solo
 * existía la cadencia mensual, y de ahí viene el nombre `months` que todavía se lee en muchos
 * sitios.
 *
 * Supuesto provisional (pending-scope R2): la cuota base es exacta en céntimos; montos que no
 * se dividen exactamente no se ofrecen, para no repartir redondeos entre miembros.
 */
export class CircleTerms {
  private constructor(
    readonly payout: Money,
    readonly turns: number,
    readonly cadence: Cadence,
    readonly startsOn: LocalDate,
    readonly baseInstallment: Money,
  ) {}

  /**
   * `turns` es el número de turnos, y por tanto de miembros. Se admite `months` como su nombre
   * anterior para no romper a quien todavía lo pasa; significan lo mismo.
   *
   * Sin `cadence` se asume mensual, que es la cadencia de todos los círculos creados antes de
   * COPAYNI-100: así un círculo existente recorre exactamente el mismo código que antes.
   *
   * `startsOn` es la fecha real de arranque (COPAYNI-106). Se admite todavía un `Period`, y
   * entonces se toma su día 1, que es el día en que empiezan todos los círculos creados hasta
   * ahora: la base de datos lo garantiza con `CHECK (extract(day FROM starts_on) = 1)`. Así la
   * conversión es exacta y quien construye condiciones a partir de un mes no cambia.
   */
  static create(props: {
    payout: Money;
    turns?: number;
    months?: number;
    cadence?: Cadence;
    startsOn: LocalDate | Period;
  }): CircleTerms {
    const { payout } = props;
    const startsOn =
      props.startsOn instanceof LocalDate ? props.startsOn : LocalDate.of(props.startsOn, 1);
    const turns = props.turns ?? props.months;
    const cadence = props.cadence ?? Cadence.default;

    if (!payout.isPositive()) {
      throw new InvalidCircleTermsError('El payout debe ser positivo');
    }
    if (turns === undefined) {
      throw new InvalidCircleTermsError('Faltan los turnos del círculo');
    }
    if (!Number.isInteger(turns) || turns < MIN_CIRCLE_TURNS) {
      throw new InvalidCircleTermsError(
        `El círculo debe tener al menos ${MIN_CIRCLE_TURNS} turnos`,
      );
    }
    if (!CircleTerms.divides(payout, turns)) {
      throw new InvalidCircleTermsError('El payout debe dividirse en cuotas exactas');
    }
    if (cadence.isMonthly() && startsOn.day !== 1) {
      // La invariante que imponía `CHECK (extract(day FROM starts_on) = 1)` hasta que la
      // expansión lo retiró (COPAYNI-107), ahora condicionada a la cadencia (COPAYNI-108): la
      // base no sabe de cadencias y por eso no podía seguir imponiéndola sin prohibir las juntas
      // semanales, que arrancan cualquier día.
      //
      // Sigue siendo necesaria, y no es una formalidad: mientras el turno se derive del mes
      // —al restaurar un ciclo y en el backfill de la expansión— el mes solo nombra el turno de
      // una junta mensual si arranca el día 1. Una junta mensual que arrancara el 20 contaría un
      // turno de más en cuanto cruzara un fin de mes. Cuando el turno se guarde siempre
      // (contracción, COPAYNI-109) esta restricción se puede revisar.
      throw new InvalidCircleTermsError('Una junta mensual arranca el día 1 del mes');
    }
    const [baseInstallment] = payout.allocate(turns);
    return new CircleTerms(payout, turns, cadence, startsOn, baseInstallment!);
  }

  /** Si `payout` se reparte en `turns` cuotas iguales sin resto. */
  static divides(payout: Money, turns: number): boolean {
    return Number.isInteger(turns) && turns > 0 && payout.amount % turns === 0;
  }

  /**
   * Número de turnos, bajo su nombre anterior.
   *
   * @deprecated Usar `turns`. Este getter existe porque muchos sitios leen `months` cuando lo
   * que necesitan es el número de puestos, y ahí sigue siendo correcto. **No** es la duración en
   * meses calendario: para eso está `durationInMonths`, que solo coincide en cadencia mensual.
   */
  get months(): number {
    return this.turns;
  }

  /**
   * Mes de arranque del círculo, para informes, agregados y para el contrato público, que habla
   * en `YYYY-MM`.
   *
   * Es una proyección sin pérdida mientras el círculo empiece un día 1, que es el caso de todos
   * los existentes. Fuera de eso pierde el día, así que **no** sirve para calcular vencimientos:
   * para eso está `startsOn`, que es la fecha real.
   */
  get startsOnPeriod(): Period {
    return this.startsOn.period;
  }

  /**
   * Duración aproximada en meses calendario, para mostrar y para informes.
   *
   * Es **aproximada** fuera de la cadencia mensual: 4 turnos semanales son 28 días, que no son
   * un mes, y hay 4,33 semanas por mes, así que ninguna cantidad de semanas cuadra con un número
   * entero de meses. No debe usarse como plazo de una obligación; el contrato y el pagaré llevan
   * fechas reales (COPAYNI-119).
   */
  get durationInMonths(): number {
    if (this.cadence.isMonthly()) return this.turns;
    return (this.turns * this.cadence.approximateTurnDays()) / 30.44;
  }

  /** Mes en que cobra el slot `position` (1 = primer turno). */
  payoutPeriodOf(position: number): Period {
    return this.schedule().payoutOn(position).period;
  }

  get currency(): string {
    return this.payout.currency;
  }

  /** Mes del último cobro del círculo. */
  get endsOn(): Period {
    return this.schedule().endsOn().period;
  }

  /**
   * El cronograma de la junta, que es quien sabe de calendario.
   *
   * `CircleTerms` no repite la aritmética: la delega aquí, para que una cadencia nueva o un
   * ajuste de fechas se toque en un solo sitio (COPAYNI-104).
   *
   * Arranca en la fecha real del círculo (COPAYNI-106), de modo que una junta que empieza un
   * jueves 12 vence los jueves.
   *
   * Proyectar el turno a su mes es una operación con pérdida fuera de la cadencia mensual:
   * cuatro turnos semanales caen en el mismo mes, así que el mes deja de identificar un turno.
   * Lo que se muestra y lo que vence lo da `TurnSchedule` con fechas reales; los getters que
   * devuelven meses quedan para quien todavía habla en meses.
   */
  private schedule(): TurnSchedule {
    return new TurnSchedule(this.startsOn, this.cadence, this.turns);
  }
}
