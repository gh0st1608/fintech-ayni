import { Inject, Injectable } from '@nestjs/common';

import {
  type AgreementTerms,
  type MembershipAgreementsPort,
  type UnsignedMembership,
} from '../../circles/application/ports/membership-agreements.port';
import {
  ExpireAgreementsUseCase,
  OpenAgreementsUseCase,
} from '../application/agreements.use-cases';
import { AGREEMENTS, type AgreementRepositoryPort } from '../application/ports';

/**
 * Implementa para los círculos el puerto `MEMBERSHIP_AGREEMENTS` (COPAYNI-89). Vive en
 * `agreements` porque es su adaptador: así `agreements` no depende de `circles` más que del
 * contrato del puerto, y `circles` no conoce los internals de la firma.
 */
@Injectable()
export class MembershipAgreementsAdapter implements MembershipAgreementsPort {
  constructor(
    @Inject(OpenAgreementsUseCase) private readonly open: OpenAgreementsUseCase,
    @Inject(ExpireAgreementsUseCase) private readonly expiry: ExpireAgreementsUseCase,
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
  ) {}

  openFor(props: {
    userId: string;
    circleId: string;
    position: number;
    terms: AgreementTerms;
  }): Promise<void> {
    const { terms } = props;
    return this.open.execute({
      userId: props.userId,
      circleId: props.circleId,
      position: props.position,
      data: {
        payout: terms.payout,
        months: terms.months,
        position: terms.position,
        baseInstallment: terms.baseInstallment,
        totalPaid: terms.totalPaid,
        retention: terms.retention,
        startsOn: terms.startsOn,
        payoutPeriod: terms.payoutPeriod,
      },
    });
  }

  async signedFor(userId: string, circleId: string): Promise<boolean> {
    const agreement = await this.agreements.find(userId, circleId);
    return agreement?.status === 'signed';
  }

  hasUnsigned(userId: string): Promise<boolean> {
    return this.agreements.hasUnsigned(userId);
  }

  expire(): Promise<UnsignedMembership[]> {
    return this.expiry.execute();
  }
}
