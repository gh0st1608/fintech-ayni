import { ValidationError } from '../../../../shared/errors/app-error';
import { type JoinConfig } from '../../domain/entities/join-config';

export const JOIN_CONFIG_REPOSITORY = Symbol('JOIN_CONFIG_REPOSITORY');

/** La moneda pedida no está en `SUPPORTED_CURRENCIES` (pending-scope M2). */
export class CurrencyNotSupportedError extends ValidationError {
  constructor() {
    super("La moneda no está habilitada para unirse a un Game'ya", { currency: 'not_supported' });
  }
}

export interface JoinConfigRepositoryPort {
  /**
   * Configuración de unión que aplica al usuario (incluye su límite de payout, si lo hay) en
   * `currency`, o en la moneda oficial si no se indica. CurrencyNotSupportedError si la moneda
   * no está habilitada.
   */
  getForUser(userId: string, currency?: string): Promise<JoinConfig>;
}
