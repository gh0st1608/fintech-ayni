import {
  type BiometricSession,
  type IdentityProviderPort,
} from '../application/identity-verification.ports';
import {
  type BiometricStatus,
  type DocumentCheck,
  IdentityVerificationUnavailableError,
} from '../domain/identity-verification';
import { type KycSimulatedResult } from './simulated-kyc';

/** DNI con resultado fijo en el proveedor simulado, para probar los rechazos documentales. */
export const SIMULATED_DNI_NOT_FOUND = '00000000';
export const SIMULATED_DNI_MISMATCH = '11111111';

const BIOMETRIC_RESULT: Record<KycSimulatedResult, BiometricStatus> = {
  approved: 'approved',
  rejected: 'declined',
  in_review: 'in_review',
};

/**
 * Proveedor de identidad simulado (desarrollo y pruebas; prohibido en production): la Consulta
 * coincide salvo con los DNI de prueba, y la sesión biométrica resuelve con
 * `KYC_SIMULATED_RESULT` en cuanto se consulta.
 */
export class SimulatedIdentityProvider implements IdentityProviderPort {
  constructor(private readonly result: KycSimulatedResult) {}

  checkDocument(props: { documentNumber: string }): Promise<DocumentCheck> {
    if (props.documentNumber === SIMULATED_DNI_NOT_FOUND) return Promise.resolve('not_found');
    if (props.documentNumber === SIMULATED_DNI_MISMATCH) return Promise.resolve('mismatch');
    return Promise.resolve('matched');
  }

  startBiometricSession(props: { reference: string }): Promise<BiometricSession> {
    return Promise.resolve({
      sessionId: `sim-${props.reference}`,
      url: `https://kyc.simulated.ayni/session/${props.reference}`,
      status: 'open',
    });
  }

  biometricStatus(): Promise<BiometricStatus | null> {
    return Promise.resolve(BIOMETRIC_RESULT[this.result]);
  }
}

/** Sin proveedor (`KYC_PROVIDER=manual`): la verificación en línea no está disponible. */
export class UnavailableIdentityProvider implements IdentityProviderPort {
  checkDocument(): Promise<DocumentCheck> {
    return Promise.reject(new IdentityVerificationUnavailableError());
  }

  startBiometricSession(): Promise<BiometricSession> {
    return Promise.reject(new IdentityVerificationUnavailableError());
  }

  /** Una verificación abierta con otro proveedor queda como está hasta volver a configurarlo. */
  biometricStatus(): Promise<BiometricStatus | null> {
    return Promise.resolve(null);
  }
}
