export const STAFF_AUTHENTICATOR = Symbol('STAFF_AUTHENTICATOR');

/** Roles del personal interno (docs/backoffice-plan.md). */
export const STAFF_ROLES = ['support', 'operations', 'finance', 'admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Persona del personal autenticada en la petición. */
export interface StaffPrincipal {
  readonly staffId: string;
  readonly roles: readonly StaffRole[];
  /** Cuándo se autenticó por última vez; las acciones críticas piden que sea reciente (step-up). */
  readonly authenticatedAt: Date;
}

/**
 * Valida el token del personal, distinto del de la app (otra audiencia y otras claves). Lanza
 * `UnauthorizedError` si no es válido. La identidad del personal (SSO + MFA) llega con la fase 1
 * del back-office; hasta entonces, `UnconfiguredStaffAuthenticator` rechaza todo.
 */
export interface StaffAuthenticatorPort {
  authenticate(accessToken: string): Promise<StaffPrincipal>;
}
