import { Inject, Injectable, Logger } from '@nestjs/common';

import { maskEmail, maskName, maskPhone } from '../../../shared/domain/services/mask-pii';
import { Money } from '../../../shared/domain/value-objects/money';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error';
import {
  IncomeAdjustmentNotAllowedError,
  KycAlreadyReviewedError,
  REJECTION_REASONS,
  type RejectionReason,
} from '../domain/document';
import {
  KYC_REVIEWS,
  type KycReviewDetail,
  type KycReviewRepositoryPort,
  type KycReviewsFilter,
  type KycReviewSubject,
  type KycReviewSummary,
} from './kyc-review.ports';
import { DOCUMENT_STORAGE, type DocumentStoragePort } from './ports';

/** Vigencia de la URL para ver una página: lo justo para abrirla. */
export const KYC_PAGE_URL_TTL_SECONDS = 60;

/** La persona como la ve el personal: identificada, con sus datos personales enmascarados. */
export interface MaskedSubject {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export type KycReviewSummaryView = Omit<KycReviewSummary, 'subject'> & { subject: MaskedSubject };

export type KycReviewDetailView = Omit<KycReviewDetail, 'subject' | 'pageFiles'> & {
  subject: MaskedSubject;
  /** Sin la clave del almacenamiento: la página se abre con una URL corta y auditada. */
  pageFiles: { page: number; purpose: string; sizeBytes: number }[];
};

const mask = (subject: KycReviewSubject): MaskedSubject => ({
  userId: subject.userId,
  name: maskName(subject.firstName, subject.lastName),
  email: subject.email ? maskEmail(subject.email) : null,
  phone: subject.phone ? maskPhone(subject.phone) : null,
});

const toDetailView = (review: KycReviewDetail): KycReviewDetailView => ({
  ...review,
  subject: mask(review.subject),
  pageFiles: review.pageFiles.map(({ page, purpose, sizeBytes }) => ({ page, purpose, sizeBytes })),
});

const notFound = (): NotFoundError =>
  new NotFoundError('No existe ese documento', 'KYC_REVIEW_NOT_FOUND');

/** `GET /admin/v1/kyc/reviews`: la cola, la más antigua primero. */
@Injectable()
export class ListKycReviewsUseCase {
  constructor(@Inject(KYC_REVIEWS) private readonly reviews: KycReviewRepositoryPort) {}

  async execute(
    filter: KycReviewsFilter,
  ): Promise<{ items: KycReviewSummaryView[]; nextCursor: string | null }> {
    const page = await this.reviews.list(filter);
    return {
      items: page.items.map((item) => ({ ...item, subject: mask(item.subject) })),
      nextCursor: page.nextCursor,
    };
  }
}

/** `GET /admin/v1/kyc/reviews/:id`: el documento, sus páginas y la persona enmascarada. */
@Injectable()
export class GetKycReviewUseCase {
  constructor(@Inject(KYC_REVIEWS) private readonly reviews: KycReviewRepositoryPort) {}

  async execute(id: string): Promise<KycReviewDetailView> {
    const review = await this.reviews.find(id);
    if (!review) throw notFound();
    return toDetailView(review);
  }
}

/** `GET /admin/v1/kyc/reviews/:id/pages/:page/url`: URL de lectura de 60 s (acción auditada). */
@Injectable()
export class GetKycPageUrlUseCase {
  constructor(
    @Inject(KYC_REVIEWS) private readonly reviews: KycReviewRepositoryPort,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async execute(id: string, page: number): Promise<{ url: string; expiresAt: Date }> {
    const review = await this.reviews.find(id);
    if (!review) throw notFound();
    const file = review.pageFiles.find((candidate) => candidate.page === page);
    if (!file) throw new NotFoundError('El documento no tiene esa página', 'KYC_PAGE_NOT_FOUND');
    return this.storage.presignDownload({
      key: file.storageKey,
      expiresInSeconds: KYC_PAGE_URL_TTL_SECONDS,
    });
  }
}

export type KycDecisionInput =
  { action: 'approve'; monthlyIncome?: number } | { action: 'reject'; reason: RejectionReason };

/**
 * `POST /admin/v1/kyc/reviews/:id/approve` y `/reject`. Solo se resuelve un documento en
 * revisión; si otra persona ya lo resolvió, responde 409 y no pisa su decisión. Al aprobar un
 * comprobante de ingresos se puede corregir el ingreso con el que figura en el documento.
 */
@Injectable()
export class DecideKycReviewUseCase {
  private readonly logger = new Logger('Kyc');

  constructor(@Inject(KYC_REVIEWS) private readonly reviews: KycReviewRepositoryPort) {}

  async execute(props: {
    id: string;
    input: KycDecisionInput;
    staffId: string;
  }): Promise<KycReviewDetailView> {
    const review = await this.reviews.find(props.id);
    if (!review) throw notFound();
    if (review.status !== 'in_review') throw new KycAlreadyReviewedError(review.status);

    const { input } = props;
    let monthlyIncome: Money | null = null;
    if (input.action === 'approve' && input.monthlyIncome !== undefined) {
      if (review.type !== 'proof_of_income' || !review.monthlyIncome) {
        throw new IncomeAdjustmentNotAllowedError();
      }
      if (!Number.isSafeInteger(input.monthlyIncome) || input.monthlyIncome <= 0) {
        throw new ValidationError('El ingreso debe ser mayor que 0', { monthlyIncome: 'invalid' });
      }
      monthlyIncome = Money.of(input.monthlyIncome, review.monthlyIncome.currency);
    }

    const result = await this.reviews.decide({
      id: props.id,
      decision:
        input.action === 'approve'
          ? { status: 'approved', monthlyIncome }
          : { status: 'rejected', reason: input.reason },
      reasonText: input.action === 'reject' ? REJECTION_REASONS[input.reason] : null,
      reviewedBy: props.staffId,
    });
    if (!result) throw notFound();
    if (!result.decided) throw new KycAlreadyReviewedError(result.status);

    this.logger.log({
      event: 'kyc.review_decided',
      documentId: props.id,
      type: review.type,
      status: input.action === 'approve' ? 'approved' : 'rejected',
      incomeAdjusted: monthlyIncome !== null,
    });
    const decided = await this.reviews.find(props.id);
    if (!decided) throw notFound();
    return toDetailView(decided);
  }
}
