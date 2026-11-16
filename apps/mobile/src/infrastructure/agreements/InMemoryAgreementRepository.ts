import {
  AgreementNotPendingError,
  DocumentsNotReadError,
  SignatureRejectedError,
} from '@/domain/agreements/errors/SignatureErrors';
import {
  AGREEMENT_DOCUMENTS,
  type AgreementDocument,
  type AgreementDocumentText,
  type MembershipAgreement,
  type SignatureChallenge,
} from '@/domain/agreements/MembershipAgreement';
import type { AgreementRepositoryPort } from '@/domain/agreements/ports/AgreementRepositoryPort';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Código que acepta el adaptador falso, igual que el del login. */
export const FAKE_SIGNATURE_CODE = '1234';

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;

/** Texto provisional: el definitivo lo redacta Legal (pending-scope §3.3, PG5). */
const FAKE_TEXT: Record<AgreementDocument, string> = {
  contract:
    'CONTRATO DE PARTICIPACIÓN EN CÍRCULO DE AHORRO (texto provisional). ' +
    'Reglas del círculo, turnos, cuotas y mora.',
  promissoryNote:
    'PAGARÉ DE SEGURO (texto provisional). Respalda las cuotas restantes si el miembro ' +
    'cobra su turno y deja de pagar.',
};

export interface InMemoryAgreementRepositoryOptions {
  latencyMs?: number;
  resendCooldownSeconds?: number;
  codeTtlSeconds?: number;
  maxAttempts?: number;
  signatureTtlHours?: number;
  agreements?: MembershipAgreement[];
  now?: () => Date;
}

interface StoredChallenge {
  agreementId: string;
  attemptsLeft: number;
  expiresAt: number;
  resendAvailableAt: number;
}

/**
 * Acuerdos falsos (solo dev y pruebas) con las mismas reglas del contrato: hay que leer los dos
 * documentos antes de pedir el código, y el código se comporta como el OTP del login.
 */
export class InMemoryAgreementRepository implements AgreementRepositoryPort {
  agreements: MembershipAgreement[];
  private readonly challenges = new Map<string, StoredChallenge>();
  private sequence = 0;
  private readonly latencyMs: number;
  private readonly resendCooldownSeconds: number;
  private readonly codeTtlSeconds: number;
  private readonly maxAttempts: number;
  private readonly signatureTtlHours: number;
  private readonly now: () => Date;

  constructor(options: InMemoryAgreementRepositoryOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.resendCooldownSeconds = options.resendCooldownSeconds ?? 30;
    this.codeTtlSeconds = options.codeTtlSeconds ?? 300;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.signatureTtlHours = options.signatureTtlHours ?? 48;
    this.now = options.now ?? (() => new Date());
    this.agreements = options.agreements ?? [this.pending('fake-agreement-1', 'fake-circle-1', 3)];
  }

  /** Un acuerdo pendiente recién abierto, con los dos documentos sin leer. */
  pending(id: string, circleId: string, position: number): MembershipAgreement {
    return {
      id,
      circleId,
      position,
      status: 'pending',
      expiresAt: new Date(this.now().getTime() + this.signatureTtlHours * HOUR),
      signedAt: null,
      unread: [...AGREEMENT_DOCUMENTS],
    };
  }

  async list(signal?: AbortSignal): Promise<MembershipAgreement[]> {
    await simulateLatency(this.latencyMs, signal);
    return this.agreements.map((agreement) => ({ ...agreement, unread: [...agreement.unread] }));
  }

  async readDocument(
    agreementId: string,
    document: AgreementDocument,
    signal?: AbortSignal,
  ): Promise<AgreementDocumentText> {
    await simulateLatency(this.latencyMs, signal);
    const agreement = this.find(agreementId);
    // Un acuerdo firmado o vencido se puede releer; solo deja de contar lo que falta por leer.
    agreement.unread = agreement.unread.filter((pending) => pending !== document);
    return {
      document,
      version: `${document}-provisional-1`,
      text: FAKE_TEXT[document],
      hash: `fake-hash-${document}`,
      readAt: this.now(),
    };
  }

  async requestSignatureCode(agreementId: string): Promise<SignatureChallenge> {
    await simulateLatency(this.latencyMs);
    const agreement = this.find(agreementId);
    if (agreement.status !== 'pending') throw new AgreementNotPendingError(agreement.status);
    if (agreement.unread.length > 0) throw new DocumentsNotReadError([...agreement.unread]);

    const existing = [...this.challenges.values()].find(
      (challenge) => challenge.agreementId === agreementId,
    );
    const at = this.now().getTime();
    if (existing && existing.resendAvailableAt > at) {
      throw new AppError('rate_limited', 'Resend not allowed yet', {
        status: 429,
        retryAfterSeconds: Math.ceil((existing.resendAvailableAt - at) / SECOND),
      });
    }
    this.sequence += 1;
    const challengeId = `fake-signature-${this.sequence}`;
    this.challenges.set(challengeId, {
      agreementId,
      attemptsLeft: this.maxAttempts,
      expiresAt: at + this.codeTtlSeconds * SECOND,
      resendAvailableAt: at + this.resendCooldownSeconds * SECOND,
    });
    return {
      challengeId,
      maskedDestination: '+51 ••• ••• 321',
      expiresAt: new Date(at + this.codeTtlSeconds * SECOND),
      resendAvailableAt: new Date(at + this.resendCooldownSeconds * SECOND),
    };
  }

  async sign(agreementId: string, code: string): Promise<MembershipAgreement> {
    await simulateLatency(this.latencyMs);
    const agreement = this.find(agreementId);
    if (agreement.status !== 'pending') throw new AgreementNotPendingError(agreement.status);
    const entry = [...this.challenges.entries()].find(
      ([, challenge]) => challenge.agreementId === agreementId,
    );
    if (!entry) throw new SignatureRejectedError('expired');
    const [challengeId, challenge] = entry;
    if (challenge.expiresAt <= this.now().getTime()) throw new SignatureRejectedError('expired');
    if (challenge.attemptsLeft <= 0) throw new SignatureRejectedError('attempts_exceeded');
    if (code !== FAKE_SIGNATURE_CODE) {
      challenge.attemptsLeft -= 1;
      if (challenge.attemptsLeft <= 0) throw new SignatureRejectedError('attempts_exceeded');
      throw new SignatureRejectedError('invalid', challenge.attemptsLeft);
    }
    this.challenges.delete(challengeId);
    agreement.status = 'signed';
    agreement.signedAt = this.now();
    return { ...agreement, unread: [...agreement.unread] };
  }

  private find(agreementId: string): MembershipAgreement {
    const agreement = this.agreements.find((candidate) => candidate.id === agreementId);
    if (!agreement) throw new AppError('not_found', 'Unknown agreement', { status: 404 });
    return agreement;
  }
}
