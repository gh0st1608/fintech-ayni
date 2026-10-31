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
  type DocumentStoragePort,
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
import { S3DocumentStorage } from './infrastructure/s3-document-storage';
import { SqlDocumentsRepository } from './infrastructure/sql-documents.repository';
import { DOCUMENT_CURRENCY, DocumentsController } from './presentation/documents.controller';

/**
 * Documentos y KYC (COPAYNI-42, 43, 46 a 49). El almacenamiento es S3 (`DOCUMENT_STORAGE=s3`,
 * floci en dev) o simulado; el proveedor de verificación es simulado o manual hasta cerrar el
 * spike COPAYNI-42.
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
      inject: [ConfigService, CLOCK],
      useFactory: (config: AppConfigService, clock: ClockPort): DocumentStoragePort =>
        config.get('DOCUMENT_STORAGE', { infer: true }) === 's3'
          ? new S3DocumentStorage({
              bucket: config.get('DOCUMENTS_BUCKET', { infer: true }),
              region: config.get('AWS_REGION', { infer: true }),
              endpoint: config.get('DOCUMENTS_S3_ENDPOINT', { infer: true }),
              publicEndpoint: config.get('DOCUMENTS_S3_PUBLIC_ENDPOINT', { infer: true }),
              now: () => clock.now(),
            })
          : new SimulatedDocumentStorage(() => clock.now()),
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
