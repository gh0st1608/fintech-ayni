import { Money } from '../../../../shared/domain/value-objects/money';
import { Cadence, type CadenceId } from '../value-objects/cadence';
import { CircleTerms } from '../value-objects/circle-terms';
import { type PayoutRange } from '../value-objects/payout-range';
import { TurnOptions } from '../value-objects/turn-options';

export interface InstallmentOption {
  /** Número de turnos, que es el número de puestos y el de cuotas. */
  turns: number;
  /**
   * Número de turnos, bajo su nombre anterior.
   *
   * @deprecated Usar `turns`. El contrato HTTP todavía lo expone como `months` y cambiarlo rompe
   * la app publicada (COPAYNI-122).
   */
  months: number;
  /** Cuota base (payout / turnos), antes de fees y descuentos del slot. */
  installment: Money;
  /** La cadencia en la que se ofrece esa duración. */
  cadence: CadenceId;
  /** Cómo se llama un turno de esa cadencia: «Mes», «Quincena», «Semana». */
  unit: string;
  /** Duración aproximada en días corridos, para comparar opciones de distinta cadencia. */
  approximateDays: number;
}

/** Lo que se puede pasar como duraciones ofrecibles: el objeto de valor o la lista de siempre. */
export type OfferedTurns = TurnOptions | readonly number[];

const asTurnOptions = (turns: OfferedTurns): TurnOptions =>
  turns instanceof TurnOptions ? turns : TurnOptions.from(turns);

const optionOf = (payout: Money, turns: number, cadence: Cadence): InstallmentOption => ({
  turns,
  months: turns,
  installment: payout.allocate(turns)[0]!,
  cadence: cadence.id,
  unit: cadence.turnLabel(),
  approximateDays: turns * cadence.approximateTurnDays(),
});

/**
 * Combinaciones cuota × turnos para un payout (Monthly Pay-in, 55:9334: 5000×6, 3000×10,
 * 2500×12 para 30.000).
 *
 * Solo se ofrecen duraciones que dan cuotas exactas en céntimos, y por eso la lista ofrecida
 * **no** es la lista configurada: con 30.000 y una configuración de 2 a 24 turnos salen 18 de las
 * 23 duraciones posibles, y con 12.000 salen 16. La regla no depende de la cadencia —reparte un
 * monto en partes iguales, no en el tiempo—, pero la duración resultante sí: 12 turnos son 12
 * meses en mensual y unas 12 semanas en semanal (COPAYNI-125).
 */
export function installmentOptions(
  payout: Money,
  turns: OfferedTurns,
  cadence: Cadence = Cadence.default,
): InstallmentOption[] {
  return asTurnOptions(turns)
    .candidates.filter((count) => CircleTerms.divides(payout, count))
    .map((count) => optionOf(payout, count, cadence));
}

/**
 * Montos del rango que sí admiten esa duración, de menor a mayor.
 *
 * Es la operación simétrica de `installmentOptions` (COPAYNI-125): quien ya sabe en cuántos
 * turnos quiere su junta necesita saber qué montos puede pedir. Recorre la grilla del rango, que
 * es finita y pequeña —con el rango y el salto de hoy son 60 montos—, en lugar de resolver la
 * divisibilidad al revés, porque el monto ofrecible tiene que caer además en un salto del
 * slider y estar dentro del rango.
 */
export function offerableAmounts(range: PayoutRange, turns: number): Money[] {
  if (!Number.isInteger(turns) || turns <= 0) return [];
  const amounts: Money[] = [];
  for (let amount = range.min.amount; amount <= range.max.amount; amount += range.step.amount) {
    if (amount % turns === 0) amounts.push(Money.of(amount, range.currency));
  }
  return amounts;
}

/** Un monto cercano que sí tiene duraciones ofrecibles, con las que tiene. */
export interface NearestOffer {
  payout: Money;
  options: InstallmentOption[];
}

/**
 * Los montos ofrecibles más cercanos a uno que no lo es, el menor y el mayor (COPAYNI-125).
 *
 * Cuando un monto no admite ninguna duración, la respuesta no puede ser una lista vacía sin
 * explicación: el usuario eligió un monto válido del slider y no tiene por qué deducir que el
 * problema es la divisibilidad. Con esto la interfaz puede decir «con 12.600 sí: 7 turnos de
 * 1.800», que es lo que aprobó producto en el diseño de COPAYNI-116.
 *
 * Devuelve lista vacía solo si ningún monto del rango admite ninguna duración, que con la
 * configuración de hoy no ocurre.
 */
export function nearestOffers(
  payout: Money,
  range: PayoutRange,
  turns: OfferedTurns,
  cadence: Cadence = Cadence.default,
): NearestOffer[] {
  const options = asTurnOptions(turns);
  const offersAt = (amount: number): NearestOffer | null => {
    const candidate = Money.of(amount, range.currency);
    const found = installmentOptions(candidate, options, cadence);
    return found.length > 0 ? { payout: candidate, options: found } : null;
  };

  const step = range.step.amount;
  const below: NearestOffer[] = [];
  for (let amount = payout.amount - step; amount >= range.min.amount; amount -= step) {
    const offer = offersAt(amount);
    if (offer) {
      below.push(offer);
      break;
    }
  }
  const above: NearestOffer[] = [];
  for (let amount = payout.amount + step; amount <= range.max.amount; amount += step) {
    const offer = offersAt(amount);
    if (offer) {
      above.push(offer);
      break;
    }
  }
  return [...below, ...above];
}
