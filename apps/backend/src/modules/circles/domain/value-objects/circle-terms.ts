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
 * desde `startsOn`, con la frecuencia que indique `cadence`. Hay tantos miembros como turnos
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
    readonly startsOn: Period,
    readonly baseInstallment: Money,
  ) {}

  /**
   * `turns` es el número de turnos, y por tanto de miembros. Se admite `months` como su nombre
   * anterior para no romper a quien todavía lo pasa; significan lo mismo.
   *
   * Sin `cadence` se asume mensual, que es la cadencia de todos los círculos creados antes de
   * COPAYNI-100: así un círculo existente recorre exactamente el mismo código que antes.
   */
  static create(props: {
    payout: Money;
    turns?: number;
    months?: number;
    cadence?: Cadence;
    startsOn: Period;
  }): CircleTerms {
    const { payout, startsOn } = props;
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
   * El ancla es el **día 1** del mes de inicio, porque `startsOn` es todavía un mes y no una
   * fecha. Es un supuesto provisional que desaparece en COPAYNI-106, cuando el círculo guarde su
   * fecha real de arranque; en cadencia mensual el día del ancla no altera el mes resultante, de
   * modo que los círculos existentes dan exactamente el mismo cronograma que antes.
   *
   * Proyectar el turno a su mes es además una operación con pérdida fuera de la cadencia
   * mensual: cuatro turnos semanales caen en el mismo mes, así que el mes deja de identificar un
   * turno. Lo que se muestra y lo que vence lo da `TurnSchedule` con fechas reales; estos
   * getters quedan para quien todavía habla en meses.
   */
  private schedule(): TurnSchedule {
    return new TurnSchedule(LocalDate.of(this.startsOn, 1), this.cadence, this.turns);
  }
}
