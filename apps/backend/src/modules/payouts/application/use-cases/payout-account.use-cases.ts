import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import {
  FIELD_CIPHER,
  type FieldCipherPort,
} from '../../../../shared/application/ports/field-cipher.port';
import { Period } from '../../../../shared/domain/value-objects/period';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  holderMatches,
  METHOD_OF_KIND,
  type PayoutAccount,
  PayoutAccountChangeNotAllowedError,
  PayoutAccountHolderMismatchError,
  PayoutAccountIdentityRequiredError,
  type PayoutAccountInput,
  validatePayoutAccount,
} from '../../domain/payout-account';
import {
  PAYOUT_ACCOUNT_OWNERS,
  PAYOUT_ACCOUNTS,
  PAYOUT_SCHEDULE,
  PAYOUT_SETTINGS,
  type PayoutAccountOwnerPort,
  type PayoutAccountRepositoryPort,
  type PayoutSchedulePort,
  type PayoutSettings,
} from '../ports/payout.ports';

/** `GET /v1/me/payout-account`: la cuenta vigente de la persona, enmascarada. */
@Injectable()
export class GetPayoutAccountUseCase {
  constructor(@Inject(PAYOUT_ACCOUNTS) private readonly accounts: PayoutAccountRepositoryPort) {}

  execute(userId: string): Promise<PayoutAccount | null> {
    return this.accounts.current(userId);
  }
}

/** `GET /admin/v1/users/:userId/payout-account`: la vigente y las anteriores, enmascaradas. */
@Injectable()
export class GetAdminPayoutAccountsUseCase {
  constructor(
    @Inject(PAYOUT_ACCOUNTS) private readonly accounts: PayoutAccountRepositoryPort,
    @Inject(PAYOUT_ACCOUNT_OWNERS) private readonly owners: PayoutAccountOwnerPort,
  ) {}

  async execute(
    userId: string,
  ): Promise<{ current: PayoutAccount | null; history: PayoutAccount[] }> {
    if (!(await this.owners.find(userId))) {
      throw new NotFoundError('No existe esa persona', 'USER_NOT_FOUND');
    }
    const history = await this.accounts.history(userId);
    return { current: history.find((account) => account.replacedAt === null) ?? null, history };
  }
}

export interface RegisterPayoutAccountCommand {
  userId: string;
  account: PayoutAccountInput;
  reason: string;
  staff: { staffId: string; email: string | null };
}

/**
 * `PUT /admin/v1/users/:userId/payout-account` (COPAYNI-81): el personal registra la cuenta de
 * cobro con la constancia que envió la persona. Reglas:
 * - la persona ya verificó su identidad y el titular es ella (no se paga a terceros);
 * - durante su mes de cobro no se cambia una cuenta ya registrada (regla de COPAYNI-37);
 * - el número se guarda cifrado; la anterior queda en el historial, nunca se borra;
 * - la cuenta fija el método de cobro (transferencia o billetera) que la unión exige.
 */
@Injectable()
export class RegisterPayoutAccountUseCase {
  private readonly logger = new Logger('Payouts');

  constructor(
    @Inject(PAYOUT_ACCOUNTS) private readonly accounts: PayoutAccountRepositoryPort,
    @Inject(PAYOUT_ACCOUNT_OWNERS) private readonly owners: PayoutAccountOwnerPort,
    @Inject(PAYOUT_SCHEDULE) private readonly schedule: PayoutSchedulePort,
    @Inject(PAYOUT_SETTINGS) private readonly settings: PayoutSettings,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipherPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: RegisterPayoutAccountCommand): Promise<PayoutAccount> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('Escribe el motivo', { reason: 'required' });
    const account = validatePayoutAccount(command.account);

    const owner = await this.owners.find(command.userId);
    if (!owner) throw new NotFoundError('No existe esa persona', 'USER_NOT_FOUND');
    if (!owner.identityVerified) throw new PayoutAccountIdentityRequiredError();
    if (
      !owner.firstName ||
      !owner.lastName ||
      !holderMatches(account.holderName, { firstName: owner.firstName, lastName: owner.lastName })
    ) {
      throw new PayoutAccountHolderMismatchError();
    }

    const now = this.clock.now();
    if (await this.accounts.current(command.userId)) {
      const thisMonth = Period.fromDate(now, this.settings.timeZone);
      const periods = await this.schedule.payoutPeriodsOf(command.userId);
      if (periods.some((period) => period.equals(thisMonth))) {
        throw new PayoutAccountChangeNotAllowedError();
      }
    }

    const saved = await this.accounts.register({
      id: randomUUID(),
      userId: command.userId,
      kind: account.kind,
      bankCode: account.bankCode,
      accountType: account.accountType,
      walletProvider: account.walletProvider,
      encryptedNumber: this.cipher.encrypt(account.number),
      last4: account.last4,
      holderName: account.holderName,
      registeredBy: command.staff.staffId,
      registeredByEmail: command.staff.email,
      reason,
      method: METHOD_OF_KIND[account.kind],
      at: now,
    });
    // Sin el número ni el titular: los logs no llevan datos personales.
    this.logger.log({
      event: 'payouts.account_registered',
      userId: command.userId,
      kind: saved.kind,
      staffId: command.staff.staffId,
    });
    return saved;
  }
}
