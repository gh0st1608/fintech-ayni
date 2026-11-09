import { type Money } from '../../../shared/domain/value-objects/money';
import {
  type DocumentStatus,
  type DocumentType,
  type RejectionReason,
  type UploadPurpose,
} from '../domain/document';

export const KYC_REVIEWS = Symbol('KYC_REVIEWS');

/** Datos de la persona tal como se guardan; la aplicación los enmascara antes de exponerlos. */
export interface KycReviewSubject {
  userId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Un documento de la cola de revisión del back-office (docs/backoffice-plan.md, fase 2). */
export interface KycReviewSummary {
  id: string;
  type: DocumentType;
  kind: string;
  status: DocumentStatus;
  pages: number;
  monthlyIncome: Money | null;
  submittedAt: Date;
  /** La persona envió después otro documento del mismo tipo: este ya no es el vigente. */
  superseded: boolean;
  subject: KycReviewSubject;
}

export interface KycReviewPage {
  page: number;
  purpose: UploadPurpose;
  sizeBytes: number;
  storageKey: string;
}

export interface KycReviewDetail extends KycReviewSummary {
  reason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  pageFiles: KycReviewPage[];
}

export interface KycReviewsFilter {
  status: DocumentStatus;
  type?: DocumentType;
  limit: number;
  cursor: string | null;
}

export interface KycReviewsPage {
  items: KycReviewSummary[];
  nextCursor: string | null;
}

export type KycDecision =
  | { status: 'approved'; monthlyIncome: Money | null }
  | { status: 'rejected'; reason: RejectionReason };

export interface KycReviewRepositoryPort {
  /** En revisión: del más antiguo al más nuevo. Revisados: del más reciente al más antiguo. */
  list(filter: KycReviewsFilter): Promise<KycReviewsPage>;
  find(id: string): Promise<KycReviewDetail | null>;
  /**
   * Resuelve la revisión solo si sigue `in_review`, en una sola sentencia: dos personas no pueden
   * resolver el mismo documento. Devuelve el estado anterior si ya estaba resuelto, o `null` si no
   * existe.
   */
  decide(props: {
    id: string;
    decision: KycDecision;
    reasonText: string | null;
    reviewedBy: string;
  }): Promise<{ decided: true } | { decided: false; status: DocumentStatus } | null>;
}
