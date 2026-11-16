import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import { MEMBERSHIP_AGREEMENTS } from '../circles/application/ports/membership-agreements.port';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import {
  ExpireAgreementsUseCase,
  ListAgreementsUseCase,
  OpenAgreementsUseCase,
  ReadAgreementDocumentUseCase,
  RequestSignatureCodeUseCase,
  SignAgreementUseCase,
} from './application/agreements.use-cases';
import {
  AGREEMENT_SETTINGS,
  AGREEMENTS,
  type AgreementSettings,
  SIGNATURE_CHALLENGES,
} from './application/ports';
import { MembershipAgreementsAdapter } from './infrastructure/membership-agreements.adapter';
import { SqlAgreementsRepository } from './infrastructure/sql-agreements.repository';
import { SqlSignatureChallengesRepository } from './infrastructure/sql-signature-challenges.repository';
import { AgreementsController } from './presentation/agreements.controller';

/**
 * Firma del contrato y del pagaré al unirse a un Game'ya (COPAYNI-89, pending-scope D3). Firma
 * electrónica simple con el código al celular, reutilizando los puertos de OTP del login, y
 * evidencia inmutable del texto exacto que se firmó.
 *
 * El texto de los documentos es **provisional**: lo redacta Legal (pending-scope §3.3, PG5).
 * Exporta `MEMBERSHIP_AGREEMENTS` para que los círculos abran los acuerdos al unirse, consulten
 * la firma en el checklist de elegibilidad y liberen el turno de quien no firmó.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AgreementsController],
  providers: [
    OpenAgreementsUseCase,
    ListAgreementsUseCase,
    ReadAgreementDocumentUseCase,
    RequestSignatureCodeUseCase,
    SignAgreementUseCase,
    ExpireAgreementsUseCase,
    SqlAgreementsRepository,
    { provide: AGREEMENTS, useExisting: SqlAgreementsRepository },
    { provide: SIGNATURE_CHALLENGES, useClass: SqlSignatureChallengesRepository },
    { provide: MEMBERSHIP_AGREEMENTS, useClass: MembershipAgreementsAdapter },
    {
      provide: AGREEMENT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): AgreementSettings => ({
        signatureTtlHours: config.get('AGREEMENT_SIGNATURE_TTL_HOURS', { infer: true }),
      }),
    },
  ],
  exports: [MEMBERSHIP_AGREEMENTS],
})
export class AgreementsModule {}
