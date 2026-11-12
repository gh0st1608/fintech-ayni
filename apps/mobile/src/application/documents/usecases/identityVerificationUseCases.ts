import {
  ConsentRequiredError,
  IDENTITY_RETURN_URL,
  type IdentityVerification,
  normalizeDni,
} from '@/domain/documents/IdentityVerification';
import type {
  IdentityVerificationRepositoryPort,
  WebAuthSessionPort,
} from '@/domain/documents/ports/IdentityVerificationPorts';

export class GetIdentityVerificationUseCase {
  constructor(private readonly repository: IdentityVerificationRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<IdentityVerification> {
    return this.repository.get(signal);
  }
}

/**
 * Inicia la verificación (COPAYNI-92): exige el consentimiento y un DNI válido antes de llamar al
 * backend. Si la Consulta coincide, abre el flujo de VerificaID y, al volver, trae el estado.
 */
export class StartIdentityVerificationUseCase {
  constructor(
    private readonly repository: IdentityVerificationRepositoryPort,
    private readonly browser: WebAuthSessionPort,
  ) {}

  async execute(input: {
    documentNumber: string;
    consentAccepted: boolean;
    consentVersion: string;
  }): Promise<IdentityVerification> {
    if (!input.consentAccepted) throw new ConsentRequiredError('Consent is required');
    const started = await this.repository.start({
      documentNumber: normalizeDni(input.documentNumber),
      consentVersion: input.consentVersion,
    });
    if (started.status !== 'inProgress' || !started.verificationUrl) return started;
    await this.browser.open(started.verificationUrl, IDENTITY_RETURN_URL);
    return this.repository.get();
  }
}

/** Retoma una verificación en curso: vuelve a abrir el flujo y trae el estado al regresar. */
export class ResumeIdentityVerificationUseCase {
  constructor(
    private readonly repository: IdentityVerificationRepositoryPort,
    private readonly browser: WebAuthSessionPort,
  ) {}

  async execute(verification: IdentityVerification): Promise<IdentityVerification> {
    if (verification.verificationUrl) {
      await this.browser.open(verification.verificationUrl, IDENTITY_RETURN_URL);
    }
    return this.repository.get();
  }
}
