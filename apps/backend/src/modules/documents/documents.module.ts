import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import { CLOCK, type ClockPort } from '../../shared/application/ports/clock.port';
import { KycPayInLimit } from './application/kyc-pay-in-limit';
import {
  DOCUMENT_SETTINGS,
  type DocumentSettings,
  ListDocumentsUseCase,
  RequestUploadUseCase,
  SubmitDocumentUseCase,
} from './application/documents.use-cases';
import {
  DOCUMENT_STORAGE,
  DOCUMENTS,
  IDENTITY_VERIFIER,
  INCOME_REVIEWER,
  KYC_STATUS,
} from './application/ports';
import {
  ManualKycReview,
  SimulatedDocumentStorage,
  SimulatedKycProvider,
} from './infrastructure/simulated-kyc';
import { SqlDocumentsRepository } from './infrastructure/sql-documents.repository';
import { DOCUMENT_CURRENCY, DocumentsController } from './presentation/documents.controller';

/**
 * Documentos y KYC (COPAYNI-42, 43, 46 a 49). El proveedor de verificación y el almacenamiento
 * son simulados hasta elegir el proveedor (spike COPAYNI-42) y conectar S3 (COPAYNI-43).
 * Exporta el estado del KYC para la elegibilidad y el límite mensual.
 */
@Module({
  controllers: [DocumentsController],
  providers: [
    RequestUploadUseCase,
    SubmitDocumentUseCase,
    ListDocumentsUseCase,
    KycPayInLimit,
    SqlDocumentsRepository,
    { provide: DOCUMENTS, useExisting: SqlDocumentsRepository },
    { provide: KYC_STATUS, useExisting: SqlDocumentsRepository },
    {
      provide: DOCUMENT_STORAGE,
      inject: [CLOCK],
      useFactory: (clock: ClockPort) => new SimulatedDocumentStorage(() => clock.now()),
    },
    {
      provide: IDENTITY_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        config.get('KYC_PROVIDER', { infer: true }) === 'simulated'
          ? new SimulatedKycProvider(config.get('KYC_SIMULATED_RESULT', { infer: true }))
          : new ManualKycReview(),
    },
    { provide: INCOME_REVIEWER, useExisting: IDENTITY_VERIFIER },
    {
      provide: DOCUMENT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): DocumentSettings => ({
        uploadUrlTtlSeconds: config.get('DOCUMENT_UPLOAD_URL_TTL_SECONDS', { infer: true }),
      }),
    },
    {
      provide: DOCUMENT_CURRENCY,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): string =>
        config.get('DEFAULT_CURRENCY', { infer: true }),
    },
  ],
  exports: [KYC_STATUS, KycPayInLimit],
})
export class DocumentsModule {}
