import { z } from 'zod';

import {
  AgreementNotPendingError,
  DocumentsNotReadError,
  SignatureRejectedError,
  type SignatureRejectionReason,
} from '@/domain/agreements/errors/SignatureErrors';
import type {
  AgreementDocument,
  AgreementDocumentText,
  AgreementStatus,
  MembershipAgreement,
  SignatureChallenge,
} from '@/domain/agreements/MembershipAgreement';
import type { AgreementRepositoryPort } from '@/domain/agreements/ports/AgreementRepositoryPort';
import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

const DOCUMENT_BY_DTO = {
  contract: 'contract',
  promissory_note: 'promissoryNote',
} as const satisfies Record<string, AgreementDocument>;
const DOCUMENT_DTO = {
  contract: 'contract',
  promissoryNote: 'promissory_note',
} as const satisfies Record<AgreementDocument, string>;

const documentDto = z.enum(['contract', 'promissory_note']);
const statusDto = z.enum(['pending', 'signed', 'expired']) satisfies z.ZodType<AgreementStatus>;

const agreementDto = z.object({
  id: z.string().min(1),
  circleId: z.string().min(1),
  position: z.number().int().positive(),
  status: statusDto,
  expiresAt: z.iso.datetime({ offset: true }),
  signedAt: z.iso.datetime({ offset: true }).nullable(),
  unread: z.array(documentDto),
});

const listDto = z.object({ agreements: z.array(agreementDto) });

const documentTextDto = z.object({
  document: documentDto,
  version: z.string().min(1),
  text: z.string().min(1),
  hash: z.string().min(1),
  readAt: z.iso.datetime({ offset: true }),
});

const challengeDto = z.object({
  challengeId: z.string().min(1),
  maskedDestination: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
  resendAvailableAt: z.iso.datetime({ offset: true }),
});

/** Códigos del backend para un código de firma rechazado (docs/api/agreements.md). */
const SIGNATURE_REJECTIONS: Record<string, SignatureRejectionReason> = {
  SIGNATURE_CODE_INVALID: 'invalid',
  SIGNATURE_CODE_EXPIRED: 'expired',
  SIGNATURE_ATTEMPTS_EXCEEDED: 'attempts_exceeded',
};

function toAgreement(dto: z.infer<typeof agreementDto>): MembershipAgreement {
  return {
    id: dto.id,
    circleId: dto.circleId,
    position: dto.position,
    status: dto.status,
    expiresAt: new Date(dto.expiresAt),
    signedAt: dto.signedAt === null ? null : new Date(dto.signedAt),
    unread: dto.unread.map((document) => DOCUMENT_BY_DTO[document]),
  };
}

/** Traduce los rechazos de negocio a errores de dominio; el resto pasa tal cual. */
export function toSignatureRejection(error: unknown): unknown {
  if (!(error instanceof AppError) || !error.code) return error;
  const reason = SIGNATURE_REJECTIONS[error.code];
  if (reason) {
    const remaining = Number(error.fieldErrors?.attemptsRemaining);
    return new SignatureRejectedError(reason, Number.isInteger(remaining) ? remaining : undefined);
  }
  if (error.code === 'AGREEMENT_NOT_PENDING') {
    const status = statusDto.safeParse(error.fieldErrors?.status);
    return new AgreementNotPendingError(status.success ? status.data : 'expired');
  }
  if (error.code === 'AGREEMENT_DOCUMENTS_NOT_READ') {
    // `pending` puede llegar como lista o como texto separado por comas.
    const pending = String(error.fieldErrors?.pending ?? '')
      .split(',')
      .map((value) => documentDto.safeParse(value.trim()))
      .flatMap((parsed) => (parsed.success ? [DOCUMENT_BY_DTO[parsed.data]] : []));
    return new DocumentsNotReadError(pending);
  }
  return error;
}

/** Adaptador HTTP de la firma del contrato y del pagaré (COPAYNI-89). */
export class AgreementApiRepository implements AgreementRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(signal?: AbortSignal): Promise<MembershipAgreement[]> {
    const dto = await this.http.get('/me/agreements', {
      signal,
      parse: (data) => listDto.parse(data),
    });
    return dto.agreements.map(toAgreement);
  }

  async readDocument(
    agreementId: string,
    document: AgreementDocument,
    signal?: AbortSignal,
  ): Promise<AgreementDocumentText> {
    const dto = await this.http.get(
      `/me/agreements/${agreementId}/documents/${DOCUMENT_DTO[document]}`,
      { signal, parse: (data) => documentTextDto.parse(data) },
    );
    return {
      document: DOCUMENT_BY_DTO[dto.document],
      version: dto.version,
      text: dto.text,
      hash: dto.hash,
      readAt: new Date(dto.readAt),
    };
  }

  async requestSignatureCode(agreementId: string): Promise<SignatureChallenge> {
    try {
      const dto = await this.http.post(`/me/agreements/${agreementId}/signature-code`, {
        parse: (data) => challengeDto.parse(data),
      });
      return {
        challengeId: dto.challengeId,
        maskedDestination: dto.maskedDestination,
        expiresAt: new Date(dto.expiresAt),
        resendAvailableAt: new Date(dto.resendAvailableAt),
      };
    } catch (error) {
      throw toSignatureRejection(error);
    }
  }

  async sign(agreementId: string, code: string): Promise<MembershipAgreement> {
    try {
      return toAgreement(
        await this.http.post(`/me/agreements/${agreementId}/signature`, {
          body: { code },
          parse: (data) => agreementDto.parse(data),
        }),
      );
    } catch (error) {
      throw toSignatureRejection(error);
    }
  }
}
