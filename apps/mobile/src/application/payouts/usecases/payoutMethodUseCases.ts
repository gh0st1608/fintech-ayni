import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import {
  PayoutMethodChangeNotAllowedError,
  PayoutMethodNotAvailableError,
  type PayoutMethods,
  type PayoutMethodType,
} from '@/domain/payouts/value-objects/PayoutMethod';
import { AppError } from '@/domain/shared/errors/AppError';

/** Catálogo de métodos de cobro con el actual (COPAYNI-37). */
export class ListPayoutMethodsUseCase {
  constructor(private readonly repository: PayoutMethodRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PayoutMethods> {
    return this.repository.list(signal);
  }
}

/**
 * Guarda el método elegido. Rechaza sin llamar al backend un método deshabilitado del catálogo
 * que se le pasa, y traduce los rechazos de negocio del backend a errores tipados.
 */
export class SelectPayoutMethodUseCase {
  constructor(private readonly repository: PayoutMethodRepositoryPort) {}

  async execute(type: PayoutMethodType, catalog: PayoutMethods): Promise<PayoutMethods> {
    if (!catalog.methods.some((method) => method.type === type && method.available)) {
      throw new PayoutMethodNotAvailableError(`Payout method ${type} is not available`);
    }
    try {
      return await this.repository.select(type);
    } catch (error) {
      if (error instanceof AppError && error.code === 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED') {
        throw new PayoutMethodChangeNotAllowedError('Payout method locked during payout month');
      }
      if (error instanceof AppError && error.code === 'PAYOUT_METHOD_NOT_AVAILABLE') {
        throw new PayoutMethodNotAvailableError(`Payout method ${type} is not available`);
      }
      throw error;
    }
  }
}
