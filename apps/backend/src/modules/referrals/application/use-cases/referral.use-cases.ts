import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { Money } from '../../../../shared/domain/value-objects/money';
import { ConflictError, DomainError, NotFoundError } from '../../../../shared/errors/app-error';
import { ReferralCode } from '../../domain/referral-code';
import {
  type InviteePage,
  REFERRAL_SETTINGS,
  REFERRALS,
  type ReferralRepositoryPort,
  type ReferralSettings,
} from '../ports/referral-repository.port';

export interface MyReferral {
  code: string;
  link: string;
  reward: Money;
}

/** `GET /v1/me/referral` (COPAYNI-51): el código, el enlace y el beneficio. */
@Injectable()
export class GetMyReferralUseCase {
  constructor(
    @Inject(REFERRALS) private readonly referrals: ReferralRepositoryPort,
    @Inject(REFERRAL_SETTINGS) private readonly settings: ReferralSettings,
  ) {}

  async execute(principal: Principal): Promise<MyReferral> {
    const code = await this.referrals.codeOf(principal.userId);
    return {
      code,
      link: `${this.settings.linkBaseUrl}?code=${code}`,
      reward: this.settings.reward,
    };
  }
}

export interface ReferralSummary {
  earned: Money;
  redeemed: Money;
  /** Ganado menos canjeado: se descuenta solo en la próxima cuota (COPAYNI-53). */
  balance: Money;
  invitees: InviteePage;
}

/** `GET /v1/me/referrals` (COPAYNI-52): saldo e invitados. */
@Injectable()
export class GetReferralSummaryUseCase {
  constructor(
    @Inject(REFERRALS) private readonly referrals: ReferralRepositoryPort,
    @Inject(REFERRAL_SETTINGS) private readonly settings: ReferralSettings,
  ) {}

  async execute(
    principal: Principal,
    query: { limit?: number; cursor: string | null },
  ): Promise<ReferralSummary> {
    const { currency } = this.settings.reward;
    const [totals, invitees] = await Promise.all([
      this.referrals.totalsOf(principal.userId, this.settings.maxRewardedInvites),
      this.referrals.inviteesOf(principal.userId, query.limit ?? 20, query.cursor),
    ]);
    const earned = Money.of(totals.earned, currency);
    const redeemed = Money.of(totals.redeemed, currency);
    return { earned, redeemed, balance: earned.subtract(redeemed), invitees };
  }
}

export class OwnReferralCodeError extends DomainError {
  constructor() {
    super('OWN_REFERRAL_CODE', 'No puedes usar tu propio código');
  }
}

export class ReferralAlreadyClaimedError extends ConflictError {
  constructor() {
    super('REFERRAL_ALREADY_CLAIMED', 'Ya usaste un código de invitación');
  }
}

/** El beneficio es para quien todavía no se unió a un círculo (su primer Game'ya). */
export class ReferralNotEligibleError extends ConflictError {
  constructor() {
    super('REFERRAL_NOT_ELIGIBLE', 'El código es para tu primer círculo');
  }
}

/**
 * `POST /v1/me/referral/claim` (COPAYNI-51): el invitado usa el código del enlace después de
 * registrarse. Una sola vez, antes de su primer círculo y nunca el propio. El beneficio vigente
 * queda congelado para los dos.
 */
@Injectable()
export class ClaimReferralUseCase {
  private readonly logger = new Logger('Referrals');

  constructor(
    @Inject(REFERRALS) private readonly referrals: ReferralRepositoryPort,
    @Inject(REFERRAL_SETTINGS) private readonly settings: ReferralSettings,
  ) {}

  async execute(principal: Principal, rawCode: string): Promise<Money> {
    const code = ReferralCode.parse(rawCode);
    const inviterId = await this.referrals.ownerOf(code);
    if (!inviterId) throw new NotFoundError('No existe ese código', 'REFERRAL_CODE_NOT_FOUND');
    if (inviterId === principal.userId) throw new OwnReferralCodeError();
    if (await this.referrals.inviterOf(principal.userId)) throw new ReferralAlreadyClaimedError();
    if (await this.referrals.hasJoinedACircle(principal.userId))
      throw new ReferralNotEligibleError();
    const claimed = await this.referrals.claim(principal.userId, inviterId, this.settings.reward);
    if (!claimed) throw new ReferralAlreadyClaimedError();
    this.logger.log({ event: 'referrals.claimed', inviteeId: principal.userId, inviterId });
    return this.settings.reward;
  }
}
