import type { IdentityVerification } from '../IdentityVerification';

/** GET y POST /v1/me/identity-verification (docs/api/documents.md). */
export interface IdentityVerificationRepositoryPort {
  get(signal?: AbortSignal): Promise<IdentityVerification>;
  start(input: { documentNumber: string; consentVersion: string }): Promise<IdentityVerification>;
}

/**
 * Abre el flujo web del proveedor y espera que vuelva a la app (o que la persona lo cierre).
 * El resultado real siempre se consulta al backend: el retorno no prueba nada.
 */
export interface WebAuthSessionPort {
  open(url: string, returnUrl: string): Promise<'returned' | 'closed'>;
}
