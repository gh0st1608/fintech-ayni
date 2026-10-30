import { Money } from '../../../shared/domain/value-objects/money';
import { type Period } from '../../../shared/domain/value-objects/period';
import { DomainError, NotFoundError, ValidationError } from '../../../shared/errors/app-error';

export class InvalidSavingCatalogError extends DomainError {
  constructor(message: string) {
    super('INVALID_SAVING_CATALOG', message);
  }
}

/** Plan de ahorro programado (COPAYNI-32). */
export interface SavingPlan {
  /** Clave estable; la app la traduce con sus JSON de idioma (supuesto R12). */
  id: string;
  /** Lo que el usuario ahorra en total. */
  target: Money;
  /** El cashback de la duración más larga: el "hasta X extra" del diseño. */
  maxCashback: Money;
}

/** Cotización de un plan con una duración (COPAYNI-33). */
export interface SavingQuote {
  planId: string;
  months: number;
  /** Una cuota por mes; si el monto no se reparte exacto, las primeras llevan un céntimo más. */
  installments: Money[];
  target: Money;
  cashback: Money;
  /** Lo que recibe al terminar: lo ahorrado más el cashback. */
  total: Money;
  /** Mes de la primera cuota. */
  startsOn: Period;
  /** Mes en que recibe el total: el siguiente a la última cuota. */
  payoutPeriod: Period;
}

/**
 * Catálogo de planes de ahorro y su cashback por duración (COPAYNI-32 y 33). Los montos, nombres y
 * porcentajes son provisionales (pending-scope R6, R12 y M6) y vienen de la configuración.
 */
export class SavingCatalog {
  private constructor(
    private readonly items: readonly { id: string; target: Money }[],
    private readonly cashbackBps: ReadonlyMap<number, number>,
  ) {}

  static create(props: {
    plans: readonly { id: string; target: Money }[];
    cashbackBps: ReadonlyMap<number, number>;
  }): SavingCatalog {
    const { plans, cashbackBps } = props;
    if (plans.length === 0 || cashbackBps.size === 0) {
      throw new InvalidSavingCatalogError('El catálogo necesita planes y duraciones');
    }
    if (new Set(plans.map(({ id }) => id)).size !== plans.length) {
      throw new InvalidSavingCatalogError('Hay planes repetidos');
    }
    if (plans.some(({ target }) => !target.isPositive())) {
      throw new InvalidSavingCatalogError('El monto de cada plan debe ser positivo');
    }
    for (const [months, bps] of cashbackBps) {
      if (
        !Number.isInteger(months) ||
        months < 1 ||
        !Number.isInteger(bps) ||
        bps < 0 ||
        bps > 10_000
      ) {
        throw new InvalidSavingCatalogError('Duración o cashback inválidos');
      }
    }
    return new SavingCatalog(
      [...plans].sort((a, b) => a.target.amount - b.target.amount),
      new Map([...cashbackBps].sort(([a], [b]) => a - b)),
    );
  }

  /** Duraciones ofrecidas, de la más corta a la más larga. */
  get durations(): number[] {
    return [...this.cashbackBps.keys()];
  }

  plans(): SavingPlan[] {
    const maxBps = Math.max(...this.cashbackBps.values());
    return this.items.map(({ id, target }) => ({
      id,
      target,
      maxCashback: target.percentage(maxBps),
    }));
  }

  quote(planId: string, months: number, startsOn: Period): SavingQuote {
    const plan = this.items.find(({ id }) => id === planId);
    if (!plan) throw new NotFoundError('No existe ese plan de ahorro', 'SAVING_PLAN_NOT_FOUND');
    const bps = this.cashbackBps.get(months);
    if (bps === undefined) {
      throw new ValidationError('Esa duración no se ofrece', { months: 'not_offered' });
    }
    const cashback = plan.target.percentage(bps);
    return {
      planId,
      months,
      installments: plan.target.allocate(months),
      target: plan.target,
      cashback,
      total: plan.target.add(cashback),
      startsOn,
      payoutPeriod: startsOn.addMonths(months),
    };
  }
}

/** `lite:300000,bronze:600000`: planes en unidades menores de `currency`. */
export function parsePlans(value: string, currency: string): { id: string; target: Money }[] {
  return value.split(',').map((entry) => {
    const [id, amount] = entry.split(':').map((part) => part.trim());
    return { id: id!, target: Money.of(Number(amount), currency) };
  });
}

/** `6:500,12:1000`: cashback en puntos básicos por duración en meses. */
export function parseCashback(value: string): Map<number, number> {
  return new Map(
    value.split(',').map((entry) => {
      const [months, bps] = entry.split(':').map((part) => Number(part.trim()));
      return [months!, bps!] as const;
    }),
  );
}
