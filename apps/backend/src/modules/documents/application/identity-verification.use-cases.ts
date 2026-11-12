import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { ValidationError } from '../../../shared/errors/app-error';
import {
  decisionOf,
  documentCheckRejection,
  IdentityAlreadyVerifiedError,
  IdentityAttemptsExceededError,
  IdentityConsentOutdatedError,
  IdentityProfileIncompleteError,
  IdentityVerificationInReviewError,
  isOpen,
  isValidDni,
} from '../domain/identity-verification';
import {
  IDENTITY_PROVIDER,
  IDENTITY_SETTINGS,
  IDENTITY_VERIFICATIONS,
  type IdentityProviderPort,
  type IdentitySettings,
  type IdentityVerification,
  type IdentityVerificationRepositoryPort,
} from './identity-verification.ports';

const HOUR_MS = 3600 * 1000;

/**
 * Trae el resultado de una verificación abierta desde el proveedor. Lo usan la app al volver del
 * flujo biométrico y el webhook: el webhook no está firmado, así que solo dispara esta consulta.
 */
@Injectable()
export class RefreshIdentityVerificationUseCase {
  private readonly logger = new Logger('IdentityVerification');

  constructor(
    @Inject(IDENTITY_VERIFICATIONS)
    private readonly verifications: IdentityVerificationRepositoryPort,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(verification: IdentityVerification): Promise<IdentityVerification> {
    if (!isOpen(verification.status) || verification.providerSessionId === null) {
      return verification;
    }
    const status = await this.provider.biometricStatus({
      sessionId: verification.providerSessionId,
      documentNumber: verification.documentNumber,
    });
    let decision = status === null ? null : decisionOf(status);
    // Sin resultado pasado el plazo: la sesión venció (o la persona usó otro DNI en el flujo, y
    // entonces el proveedor nunca la asocia al DNI declarado).
    if (
      (decision === null || decision.status === 'in_progress') &&
      this.clock.now().getTime() - verification.createdAt.getTime() >
        this.settings.sessionTtlHours * HOUR_MS
    ) {
      decision = { status: 'rejected', reason: 'session_expired' };
    }
    if (decision === null || decision.status === verification.status) return verification;
    const decided = await this.verifications.decide(verification.id, decision);
    // Sin el DNI en el log: solo el id, el usuario y el resultado.
    this.logger.log({
      event: 'identity.verification.decided',
      verificationId: decided.id,
      userId: decided.userId,
      status: decided.status,
      reason: decided.reason,
    });
    return decided;
  }
}

/**
 * `POST /v1/me/identity-verification` (COPAYNI-42): valida el DNI contra RENIEC y, si coincide
 * con el perfil, abre la sesión biométrica. Una sesión abierta con el mismo DNI se reutiliza:
 * cada CheckMatch tiene costo.
 */
@Injectable()
export class StartIdentityVerificationUseCase {
  private readonly logger = new Logger('IdentityVerification');

  constructor(
    @Inject(IDENTITY_VERIFICATIONS)
    private readonly verifications: IdentityVerificationRepositoryPort,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
    @Inject(IDENTITY_SETTINGS) private readonly settings: IdentitySettings,
    @Inject(RefreshIdentityVerificationUseCase)
    private readonly refresh: RefreshIdentityVerificationUseCase,
  ) {}

  async execute(
    principal: Principal,
    command: { documentNumber: string; consentVersion: string },
  ): Promise<IdentityVerification> {
    if (command.consentVersion !== this.settings.consentVersion) {
      throw new IdentityConsentOutdatedError();
    }
    if (!isValidDni(command.documentNumber)) {
      throw new ValidationError('El DNI tiene 8 dígitos', { documentNumber: 'invalid' });
    }
    const current = await this.verifications.latest(principal.userId);
    const latest = current ? await this.refresh.execute(current) : null;
    if (latest?.status === 'approved') throw new IdentityAlreadyVerifiedError();
    if (latest?.status === 'in_review') throw new IdentityVerificationInReviewError();
    if (latest?.status === 'in_progress') {
      if (latest.documentNumber === command.documentNumber) return latest;
      // Otro DNI: la sesión anterior queda abandonada y se empieza de nuevo.
      await this.verifications.decide(latest.id, { status: 'rejected', reason: 'abandoned' });
    }
    const rejections = await this.verifications.countedRejections(principal.userId);
    if (rejections >= this.settings.maxRejectedAttempts) {
      throw new IdentityAttemptsExceededError(this.settings.maxRejectedAttempts);
    }
    const subject = await this.verifications.subject(principal.userId);
    const missing = (['firstName', 'lastName', 'email'] as const).filter(
      (field) => !subject?.[field]?.trim(),
    );
    if (missing.length > 0) throw new IdentityProfileIncompleteError(missing);

    const id = randomUUID();
    const base = {
      id,
      userId: principal.userId,
      documentNumber: command.documentNumber,
      consentVersion: command.consentVersion,
      providerSessionId: null,
      verificationUrl: null,
    };
    if (await this.verifications.verifiedByOther(principal.userId, command.documentNumber)) {
      return this.record({
        ...base,
        documentCheck: 'matched',
        decision: { status: 'rejected', reason: 'document_in_use' },
      });
    }
    const check = await this.provider.checkDocument({
      documentNumber: command.documentNumber,
      firstName: subject!.firstName!,
      lastName: subject!.lastName!,
    });
    if (check !== 'matched') {
      return this.record({
        ...base,
        documentCheck: check,
        decision: { status: 'rejected', reason: documentCheckRejection(check) },
      });
    }
    const session = await this.provider.startBiometricSession({
      reference: id,
      email: subject!.email!,
      callbackUrl: this.settings.callbackUrl,
    });
    return this.record({
      ...base,
      documentCheck: check,
      decision: decisionOf(session.status),
      providerSessionId: session.sessionId,
      verificationUrl: session.url,
    });
  }

  private async record(
    verification: Parameters<IdentityVerificationRepositoryPort['create']>[0],
  ): Promise<IdentityVerification> {
    const created = await this.verifications.create(verification);
    this.logger.log({
      event: 'identity.verification.started',
      verificationId: created.id,
      userId: created.userId,
      documentCheck: created.documentCheck,
      status: created.status,
      reason: created.reason,
    });
    return created;
  }
}

/** `GET /v1/me/identity-verification`: la verificación vigente, al día con el proveedor. */
@Injectable()
export class GetIdentityVerificationUseCase {
  constructor(
    @Inject(IDENTITY_VERIFICATIONS)
    private readonly verifications: IdentityVerificationRepositoryPort,
    @Inject(RefreshIdentityVerificationUseCase)
    private readonly refresh: RefreshIdentityVerificationUseCase,
  ) {}

  async execute(principal: Principal): Promise<IdentityVerification | null> {
    const latest = await this.verifications.latest(principal.userId);
    return latest ? this.refresh.execute(latest) : null;
  }
}

/** Webhook del proveedor: solo identifica la sesión; el resultado se consulta al proveedor. */
@Injectable()
export class HandleIdentityWebhookUseCase {
  constructor(
    @Inject(IDENTITY_VERIFICATIONS)
    private readonly verifications: IdentityVerificationRepositoryPort,
    @Inject(RefreshIdentityVerificationUseCase)
    private readonly refresh: RefreshIdentityVerificationUseCase,
  ) {}

  async execute(providerSessionId: string): Promise<void> {
    const verification = await this.verifications.findBySession(providerSessionId);
    if (verification) await this.refresh.execute(verification);
  }
}
