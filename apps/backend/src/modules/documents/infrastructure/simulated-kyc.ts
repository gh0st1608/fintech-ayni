import {
  type DocumentStoragePort,
  type IdentityVerifierPort,
  type IncomeReviewerPort,
  type VerificationResult,
} from '../application/ports';

export type KycSimulatedResult = VerificationResult['status'];

/**
 * Almacenamiento simulado (COPAYNI-43, hasta conectar S3): firma una URL ficticia y da por subido
 * todo archivo. Prohibido en production.
 */
export class SimulatedDocumentStorage implements DocumentStoragePort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  presignUpload(props: {
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(this.now().getTime() + props.expiresInSeconds * 1000);
    return Promise.resolve({
      url: `https://documents.simulated.ayni/${props.key}?expires=${expiresAt.getTime()}`,
      expiresAt,
    });
  }

  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * Proveedor de KYC simulado (spike COPAYNI-42): responde siempre el resultado configurado
 * (`KYC_SIMULATED_RESULT`). Prohibido en production.
 */
export class SimulatedKycProvider implements IdentityVerifierPort, IncomeReviewerPort {
  constructor(private readonly result: KycSimulatedResult) {}

  verifyNationalId(): Promise<VerificationResult> {
    return Promise.resolve(this.outcome('El documento no se pudo leer: vuelve a escanearlo'));
  }

  review(): Promise<VerificationResult> {
    return Promise.resolve(this.outcome('El comprobante no es legible o no es reciente'));
  }

  private outcome(reason: string): VerificationResult {
    return { status: this.result, reason: this.result === 'rejected' ? reason : null };
  }
}

/**
 * Sin proveedor (`KYC_PROVIDER=manual`): todo documento queda en revisión para el equipo de
 * operaciones. Es lo admitido en production hasta cerrar el spike COPAYNI-42.
 */
export class ManualKycReview implements IdentityVerifierPort, IncomeReviewerPort {
  verifyNationalId(): Promise<VerificationResult> {
    return Promise.resolve({ status: 'in_review', reason: null });
  }

  review(): Promise<VerificationResult> {
    return this.verifyNationalId();
  }
}
