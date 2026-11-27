import { DomainError } from '../../../../shared/errors/app-error';
import { type ExchangeRates } from '../../../../shared/domain/value-objects/exchange-rates';
import { Money } from '../../../../shared/domain/value-objects/money';
import { minorPerUnit, type PayoutRange } from '../value-objects/payout-range';
import { InvalidTurnOptionsError, TurnOptions } from '../value-objects/turn-options';

export class InvalidJoinConfigError extends DomainError {
  constructor(message: string) {
    super('INVALID_JOIN_CONFIG', message);
  }
}

/**
 * Las duraciones de una configuración, dada de una de las tres formas admitidas.
 *
 * Las dos primeras conviven a propósito (COPAYNI-125): ningún rango reproduce exactamente la
 * lista `6,10,12` que está hoy en producción, así que la lista no se puede sustituir por un rango
 * sin cambiar lo que se le ofrece a la gente. Un error de las duraciones se reexpresa como error
 * de la configuración de unión, que es el contrato que ya manejan sus llamadores.
 */
function turnsOf(props: {
  durationOptions?: readonly number[];
  turnRange?: { min: number; max: number };
  turnOptions?: TurnOptions;
}): TurnOptions {
  const given = [props.durationOptions, props.turnRange, props.turnOptions].filter(
    (value) => value !== undefined,
  );
  if (given.length !== 1) {
    throw new InvalidJoinConfigError(
      'Hay que dar las duraciones de una sola forma: lista, rango u opciones',
    );
  }
  try {
    if (props.turnOptions) return props.turnOptions;
    if (props.turnRange) return TurnOptions.range(props.turnRange.min, props.turnRange.max);
    return TurnOptions.list(props.durationOptions!);
  } catch (error) {
    if (error instanceof InvalidTurnOptionsError) {
      throw new InvalidJoinConfigError(error.message);
    }
    throw error;
  }
}

/**
 * Montos y duraciones con los que un usuario puede unirse a un Game'ya o al programa de
 * ahorro (COPAYNI-27 a 29). `userPayoutLimit` es null mientras no se restrinja (R5).
 */
export class JoinConfig {
  private constructor(
    readonly payoutRange: PayoutRange,
    readonly savingProgramMax: Money,
    readonly userPayoutLimit: Money | null,
    /** Cuántos turnos puede elegir el usuario: la lista cerrada o el rango (COPAYNI-125). */
    readonly turnOptions: TurnOptions,
  ) {}

  /**
   * Cuántos turnos se ofrecen, de menor a mayor.
   *
   * @deprecated Usar `turnOptions`. El nombre viene de cuando un turno era siempre un mes; el
   * número sigue siendo el de puestos y cuotas, pero la duración depende de la cadencia.
   */
  get durationOptions(): readonly number[] {
    return this.turnOptions.candidates;
  }

  static create(props: {
    payoutRange: PayoutRange;
    savingProgramMax: Money;
    userPayoutLimit: Money | null;
    /** La lista cerrada de duraciones. Excluyente con `turnRange` y `turnOptions`. */
    durationOptions?: readonly number[];
    /** El rango configurable de turnos, ambos extremos incluidos (COPAYNI-125). */
    turnRange?: { min: number; max: number };
    /** Las duraciones ya resueltas, para reconstruir una configuración existente. */
    turnOptions?: TurnOptions;
  }): JoinConfig {
    const { payoutRange, savingProgramMax, userPayoutLimit } = props;
    if (!savingProgramMax.isPositive()) {
      throw new InvalidJoinConfigError('El máximo del programa de ahorro debe ser positivo');
    }
    const amounts = [savingProgramMax, ...(userPayoutLimit ? [userPayoutLimit] : [])];
    if (amounts.some((money) => money.currency !== payoutRange.currency)) {
      throw new InvalidJoinConfigError('Todos los montos deben estar en la moneda del payout');
    }
    if (userPayoutLimit && userPayoutLimit.amount < 0) {
      throw new InvalidJoinConfigError('El límite de payout del usuario no puede ser negativo');
    }
    return new JoinConfig(payoutRange, savingProgramMax, userPayoutLimit, turnsOf(props));
  }

  get currency(): string {
    return this.payoutRange.currency;
  }

  /**
   * La misma configuración en otra moneda (pending-scope M6): el rango equivalente y los topes
   * convertidos hacia abajo, en unidades enteras, para no superar nunca el monto original.
   */
  convertedTo(currency: string, rates: ExchangeRates): JoinConfig {
    if (currency === this.currency) return this;
    const unit = minorPerUnit(currency);
    const cap = (money: Money): Money => {
      const converted = rates.convert(money, currency, 'down').amount;
      return Money.of(Math.floor(converted / unit) * unit, currency);
    };
    return JoinConfig.create({
      payoutRange: this.payoutRange.convertedTo(currency, rates),
      savingProgramMax: cap(this.savingProgramMax),
      userPayoutLimit: this.userPayoutLimit && cap(this.userPayoutLimit),
      turnOptions: this.turnOptions,
    });
  }

  /** Si el usuario puede elegir este payout: dentro del rango, en un salto y bajo su límite. */
  allowsPayout(payout: Money): boolean {
    return (
      this.payoutRange.contains(payout) &&
      (this.userPayoutLimit === null || payout.amount <= this.userPayoutLimit.amount)
    );
  }
}
