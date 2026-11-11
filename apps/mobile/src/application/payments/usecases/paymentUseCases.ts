import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { PaymentSettings } from '@/domain/payments/PaymentSettings';
import type { PaymentStreak } from '@/domain/payments/PaymentStreak';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type { PayoutEligibility } from '@/domain/payments/PayoutEligibility';
import type {
  TransactionDetail,
  TransactionsPage,
  TransactionType,
} from '@/domain/payments/Transaction';
import type { ClipboardPort } from '@/domain/referrals/ports/DevicePorts';

/** Resumen de pagos de la pestaña Payment (COPAYNI-35). */
export class GetPaymentSummaryUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PaymentSummary> {
    return this.repository.getSummary(signal);
  }
}

/** Historial de pagos o de cobros, por páginas (COPAYNI-41). */
export class ListTransactionsUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage> {
    return this.repository.listTransactions(type, cursor, signal);
  }
}

/** Racha de pagos a tiempo del icono de fuego (COPAYNI-82). */
export class GetPaymentStreakUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PaymentStreak> {
    return this.repository.getPaymentStreak(signal);
  }
}

/** Detalle de un movimiento del historial (COPAYNI-78). */
export class GetTransactionUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(type: TransactionType, id: string, signal?: AbortSignal): Promise<TransactionDetail> {
    return this.repository.getTransaction(type, id, signal);
  }
}

/** Copia el número de operación de un movimiento (COPAYNI-78). */
export class CopyOperationNumberUseCase {
  constructor(private readonly clipboard: ClipboardPort) {}

  execute(operation: string): Promise<void> {
    return this.clipboard.copy(operation);
  }
}

/** Checklist para recibir el payout (COPAYNI-36): el backend calcula cada requisito. */
export class GetPayoutEligibilityUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PayoutEligibility> {
    return this.repository.getPayoutEligibility(signal);
  }
}

/** Preferencias de pago (COPAYNI-38). */
export class GetPaymentSettingsUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<PaymentSettings> {
    return this.repository.getSettings(signal);
  }
}

/** Activa o desactiva la deducción del pay-in desde el payout (COPAYNI-38). */
export class UpdatePaymentSettingsUseCase {
  constructor(private readonly repository: PaymentRepositoryPort) {}

  execute(settings: PaymentSettings): Promise<PaymentSettings> {
    return this.repository.updateSettings(settings);
  }
}
