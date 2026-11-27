import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { NotFoundError } from '../../../shared/errors/app-error';
import {
  AUTH_POLICY,
  type AuthPolicy,
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  type OtpGeneratorPort,
  type OtpHasherPort,
  type OtpSenderPort,
  resolveOtpLanguage,
} from '../../auth/application/ports/auth.ports';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../users/application/ports/user-repository.port';
import { type OtpChannel } from '../../users/domain/value-objects/login-identifier';
import {
  type AgreementDocument,
  assertPending,
  assertReadyToSign,
  effectiveStatus,
  type MembershipAgreement,
  unreadDocuments,
} from '../domain/agreement';
import { SignatureChallenge, type SignatureOutcome } from '../domain/signature-challenge';
import { type AgreementData, hashOf, renderAgreement, templateVersion } from '../domain/templates';
import {
  AGREEMENT_SETTINGS,
  AGREEMENTS,
  type AgreementRepositoryPort,
  type AgreementSettings,
  type ExpiredMembership,
  SIGNATURE_CHALLENGES,
  type SignatureChallengeRepositoryPort,
} from './ports';
import { signatureError } from './signature-errors';

/** Un acuerdo tal como lo ve la app: sin hashes, con el estado efectivo y lo que falta leer. */
export interface AgreementView {
  id: string;
  circleId: string;
  position: number;
  status: ReturnType<typeof effectiveStatus>;
  expiresAt: Date;
  signedAt: Date | null;
  /** Documentos que todavía no se leyeron: sin ninguno pendiente se puede pedir el código. */
  unread: AgreementDocument[];
}

const toView = (agreement: MembershipAgreement, now: Date): AgreementView => ({
  id: agreement.id,
  circleId: agreement.circleId,
  position: agreement.position,
  status: effectiveStatus(agreement, now),
  expiresAt: agreement.expiresAt,
  signedAt: agreement.signedAt,
  unread: unreadDocuments(agreement),
});

const HOUR_MS = 60 * 60 * 1000;

/**
 * Crea los dos acuerdos de una unión (COPAYNI-89). Lo llama el módulo de círculos al unirse, con
 * los datos del turno ya resueltos: `agreements` no lee de `circles`.
 *
 * El texto canónico se renderiza aquí y solo se guarda su hash con la versión de la plantilla. El
 * texto se vuelve a renderizar al leerlo, y si el hash no coincide es que la plantilla cambió
 * después de firmar: por eso la evidencia guarda su propia copia de los hashes.
 */
@Injectable()
export class OpenAgreementsUseCase {
  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(AGREEMENT_SETTINGS) private readonly settings: AgreementSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(props: {
    userId: string;
    circleId: string;
    position: number;
    data: AgreementData;
  }): Promise<void> {
    const now = this.clock.now();
    const contractText = renderAgreement('contract', props.data);
    const noteText = renderAgreement('promissory_note', props.data);
    await this.agreements.create({
      id: randomUUID(),
      userId: props.userId,
      circleId: props.circleId,
      position: props.position,
      // La versión lleva la cadencia: cada documento se aprueba por separado (COPAYNI-119).
      contractVersion: templateVersion('contract', props.data.cadence),
      contractText,
      contractHash: hashOf(contractText),
      promissoryNoteVersion: templateVersion('promissory_note', props.data.cadence),
      promissoryNoteText: noteText,
      promissoryNoteHash: hashOf(noteText),
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.settings.signatureTtlHours * HOUR_MS),
    });
  }
}

/** Mis acuerdos y su estado (COPAYNI-89). */
@Injectable()
export class ListAgreementsUseCase {
  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(principal: Principal): Promise<AgreementView[]> {
    const now = this.clock.now();
    const agreements = await this.agreements.listFor(principal.userId);
    return agreements.map((agreement) => toView(agreement, now));
  }
}

export interface AgreementDocumentView {
  document: AgreementDocument;
  version: string;
  text: string;
  /** SHA-256 del texto: la app lo muestra como referencia de lo que firma. */
  hash: string;
  readAt: Date | null;
}

/**
 * El texto de un documento del acuerdo y, al leerlo, lo marca leído: sin leer los dos no se puede
 * pedir el código de firma (criterio de aceptación de COPAYNI-89).
 *
 * El texto se guardó al unirse y se devuelve tal cual: la evidencia es lo que la persona leyó y
 * firmó, no la plantilla vigente, que puede haber cambiado desde entonces.
 */
@Injectable()
export class ReadAgreementDocumentUseCase {
  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    agreementId: string,
    document: AgreementDocument,
  ): Promise<AgreementDocumentView> {
    const now = this.clock.now();
    const agreement = await this.agreements.byId(agreementId);
    if (!agreement || agreement.userId !== principal.userId) {
      throw new NotFoundError('No se encontró el acuerdo', 'AGREEMENT_NOT_FOUND');
    }
    const stored = document === 'contract' ? agreement.contract : agreement.promissoryNote;
    // Leer no exige que el acuerdo siga vigente: se puede releer lo ya firmado o lo vencido.
    if (stored.readAt === null && effectiveStatus(agreement, now) === 'pending') {
      await this.agreements.markRead(agreement.id, document, now);
    }
    return {
      document,
      version: stored.version,
      text: stored.text,
      hash: stored.hash,
      readAt: stored.readAt ?? (effectiveStatus(agreement, now) === 'pending' ? now : null),
    };
  }
}

export interface SignatureCodeView {
  challengeId: string;
  maskedDestination: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

/**
 * Envía el código que firma los dos documentos (COPAYNI-89). Exige haber leído ambos. Un segundo
 * pedido reenvía sobre el mismo desafío, con la ventana y los reenvíos de la política de OTP.
 */
@Injectable()
export class RequestSignatureCodeUseCase {
  private readonly logger = new Logger('Agreements');

  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(SIGNATURE_CHALLENGES) private readonly challenges: SignatureChallengeRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(OTP_GENERATOR) private readonly generator: OtpGeneratorPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderPort,
    @Inject(AUTH_POLICY) private readonly policy: AuthPolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    agreementId: string,
    acceptLanguage?: string,
  ): Promise<SignatureCodeView> {
    const now = this.clock.now();
    const agreement = await this.agreements.byId(agreementId);
    if (!agreement || agreement.userId !== principal.userId) {
      throw new NotFoundError('No se encontró el acuerdo', 'AGREEMENT_NOT_FOUND');
    }
    assertReadyToSign(agreement, now);

    const destination = await this.destinationOf(principal.userId);
    const existing = await this.challenges.latestFor(agreementId);
    const code = this.generator.generate();
    const challenge = await this.issueOrResend(agreementId, existing, code, now);
    const { id, expiresAt, resendAvailableAt } = challenge.snapshot;

    await this.sender.send({
      channel: destination.channel,
      destination: destination.value,
      code,
      language: resolveOtpLanguage(destination.language, acceptLanguage),
    });
    this.logger.log({ event: 'agreements.code_sent', userId: principal.userId, agreementId });
    return { challengeId: id, maskedDestination: destination.masked, expiresAt, resendAvailableAt };
  }

  private async issueOrResend(
    agreementId: string,
    existing: SignatureChallenge | null,
    code: string,
    now: Date,
  ): Promise<SignatureChallenge> {
    const reusable = existing?.snapshot;
    if (reusable && reusable.status !== 'consumed' && now < reusable.expiresAt) {
      const updated = await this.challenges.update(reusable.id, (challenge) => {
        challenge.resend({
          codeHash: this.hasher.hash(reusable.id, code),
          now,
          policy: this.policy.otp,
        });
        return challenge;
      });
      if (updated) return updated;
    }
    const id = randomUUID();
    const challenge = SignatureChallenge.issue({
      id,
      agreementId,
      codeHash: this.hasher.hash(id, code),
      now,
      policy: this.policy.otp,
    });
    await this.challenges.create(challenge);
    return challenge;
  }

  /** El código va al celular (COPAYNI-89); sin teléfono, al email. */
  private async destinationOf(userId: string): Promise<{
    channel: OtpChannel;
    value: string;
    masked: string;
    language: string | null;
  }> {
    const user = await this.users.findById(userId);
    const identifier = user?.loginIdentifier('sms') ?? user?.loginIdentifier('email');
    if (!user || !identifier) {
      throw new NotFoundError('No hay a dónde enviar el código', 'SIGNATURE_DESTINATION_MISSING');
    }
    return {
      channel: identifier.channel,
      value: identifier.value,
      masked: identifier.masked(),
      language: user.preferredLanguage,
    };
  }
}

export interface SignedAgreementView extends AgreementView {
  /** Los dos documentos quedaron firmados con esta evidencia. */
  signedAt: Date;
}

/**
 * Firma los dos documentos con el código (COPAYNI-89). Un código correcto los firma a la vez y
 * guarda la evidencia inmutable: fecha, IP, dispositivo y los hashes de lo que se firmó. Un
 * código incorrecto o vencido no firma y se puede pedir otro.
 */
@Injectable()
export class SignAgreementUseCase {
  private readonly logger = new Logger('Agreements');

  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(SIGNATURE_CHALLENGES) private readonly challenges: SignatureChallengeRepositoryPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    agreementId: string,
    input: { code: string; ip: string | null; userAgent: string | null },
  ): Promise<SignedAgreementView> {
    const now = this.clock.now();
    const agreement = await this.agreements.byId(agreementId);
    if (!agreement || agreement.userId !== principal.userId) {
      throw new NotFoundError('No se encontró el acuerdo', 'AGREEMENT_NOT_FOUND');
    }
    assertPending(agreement, now);

    const challenge = await this.challenges.latestFor(agreementId);
    if (!challenge) throw signatureError({ kind: 'expired' });
    const { id } = challenge.snapshot;
    const outcome = await this.challenges.update(id, (current) =>
      current.attempt(this.hasher.matches(id, input.code, current.codeHash), now),
    );
    if (!outcome) throw signatureError({ kind: 'expired' });
    if (outcome.kind !== 'verified') throw signatureError(outcome);

    const signed = await this.agreements.sign(agreement.id, {
      signedAt: now,
      ip: input.ip,
      userAgent: input.userAgent,
      contractHash: agreement.contract.hash,
      promissoryNoteHash: agreement.promissoryNote.hash,
    });
    // Otra solicitud lo firmó o el plazo venció entre la validación y la escritura.
    if (!signed) assertPending((await this.agreements.byId(agreement.id))!, now);

    this.logger.log({ event: 'agreements.signed', userId: principal.userId, agreementId });
    return { ...toView({ ...agreement, status: 'signed', signedAt: now }, now), signedAt: now };
  }
}

/**
 * Marca vencidos los acuerdos que pasaron su plazo sin firma y devuelve las membresías cuyo turno
 * hay que liberar (COPAYNI-89). No toca `circle_memberships`: eso lo hace el módulo de círculos,
 * que es su dueño. Idempotente: un acuerdo ya vencido no vuelve a salir.
 */
@Injectable()
export class ExpireAgreementsUseCase {
  private readonly logger = new Logger('Agreements');

  constructor(
    @Inject(AGREEMENTS) private readonly agreements: AgreementRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<ExpiredMembership[]> {
    const expired = await this.agreements.expire(this.clock.now());
    if (expired.length > 0) {
      this.logger.warn({ event: 'agreements.expired', count: expired.length });
    }
    return expired;
  }
}

export { type SignatureOutcome };
