import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import { type AppConfigService } from '../../config/configuration';
import { CLOCK, type ClockPort } from '../../shared/application/ports/clock.port';
import {
  IDENTITY_PROVIDER,
  IDENTITY_SETTINGS,
  IDENTITY_VERIFICATIONS,
  type IdentityProviderPort,
  type IdentitySettings,
} from './application/identity-verification.ports';
import {
  GetIdentityVerificationUseCase,
  HandleIdentityWebhookUseCase,
  RefreshIdentityVerificationUseCase,
  StartIdentityVerificationUseCase,
} from './application/identity-verification.use-cases';
import { KycPayInLimit } from './application/kyc-pay-in-limit';
import { KYC_REVIEWS } from './application/kyc-review.ports';
import {
  DecideKycReviewUseCase,
  GetKycPageUrlUseCase,
  GetKycReviewUseCase,
  ListKycReviewsUseCase,
} from './application/kyc-review.use-cases';
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
import {
  SimulatedIdentityProvider,
  UnavailableIdentityProvider,
} from './infrastructure/simulated-identity-provider';
import { SqlIdentityVerificationsRepository } from './infrastructure/sql-identity-verifications.repository';
import { VerificaIdIdentityProvider } from './infrastructure/verificaid/verificaid-identity-provider';
import { SqlDocumentsRepository } from './infrastructure/sql-documents.repository';
import { SqlKycReviewsRepository } from './infrastructure/sql-kyc-reviews.repository';
import { AdminKycController } from './presentation/admin-kyc.controller';
import { DOCUMENT_CURRENCY, DocumentsController } from './presentation/documents.controller';
import { IdentityVerificationController } from './presentation/identity-verification.controller';
import {
  VERIFICAID_WEBHOOK_SETTINGS,
  VerificaIdWebhookController,
  type VerificaIdWebhookSettings,
} from './presentation/verificaid-webhook.controller';

/**
 * Documentos y KYC (COPAYNI-42, 43, 46 a 49). El almacenamiento es S3 (`DOCUMENT_STORAGE=s3`,
 * floci en dev) o simulado. La identidad se verifica con VerificaID (`KYC_PROVIDER=verificaid`:
 * Consulta y CheckMatch), simulada o, sin proveedor (`manual`), con la subida del DNI que revisa
 * operaciones.
 * Exporta el estado del KYC para la elegibilidad y el límite mensual.
 */
@Module({
  controllers: [
    DocumentsController,
    AdminKycController,
    IdentityVerificationController,
    VerificaIdWebhookController,
  ],
  providers: [
    RequestUploadUseCase,
    SubmitDocumentUseCase,
    ListDocumentsUseCase,
    KycPayInLimit,
    SqlDocumentsRepository,
    { provide: DOCUMENTS, useExisting: SqlDocumentsRepository },
    { provide: KYC_STATUS, useExisting: SqlDocumentsRepository },
    // Revisión manual desde el back-office (docs/backoffice-plan.md, fase 2).
    ListKycReviewsUseCase,
    GetKycReviewUseCase,
    GetKycPageUrlUseCase,
    DecideKycReviewUseCase,
    { provide: KYC_REVIEWS, useClass: SqlKycReviewsRepository },
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
    // Verificación de identidad en línea (COPAYNI-42): Consulta y CheckMatch de VerificaID.
    StartIdentityVerificationUseCase,
    GetIdentityVerificationUseCase,
    RefreshIdentityVerificationUseCase,
    HandleIdentityWebhookUseCase,
    {
      provide: IDENTITY_VERIFICATIONS,
      inject: [getDataSourceToken(), ConfigService],
      useFactory: (dataSource: DataSource, config: AppConfigService) =>
        new SqlIdentityVerificationsRepository(
          dataSource,
          config.get('KYC_PROVIDER', { infer: true }),
        ),
    },
    {
      provide: IDENTITY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): IdentityProviderPort => {
        switch (config.get('KYC_PROVIDER', { infer: true })) {
          case 'verificaid':
            return new VerificaIdIdentityProvider({
              apiUrl: config.get('VERIFICAID_API_URL', { infer: true }).replace(/\/+$/, ''),
              apiToken: config.get('VERIFICAID_API_TOKEN', { infer: true }),
              timeoutMs: config.get('VERIFICAID_TIMEOUT_MS', { infer: true }),
            });
          case 'simulated':
            return new SimulatedIdentityProvider(
              config.get('KYC_SIMULATED_RESULT', { infer: true }),
            );
          case 'manual':
            return new UnavailableIdentityProvider();
        }
      },
    },
    {
      provide: IDENTITY_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): IdentitySettings => ({
        consentVersion: config.get('IDENTITY_CONSENT_VERSION', { infer: true }),
        callbackUrl: config.get('VERIFICAID_CALLBACK_URL', { infer: true }),
        maxRejectedAttempts: config.get('IDENTITY_MAX_REJECTED_ATTEMPTS', { infer: true }),
        sessionTtlHours: config.get('IDENTITY_SESSION_TTL_HOURS', { infer: true }),
      }),
    },
    {
      provide: VERIFICAID_WEBHOOK_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): VerificaIdWebhookSettings => ({
        token: config.get('VERIFICAID_WEBHOOK_TOKEN', { infer: true }) ?? null,
      }),
    },
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
