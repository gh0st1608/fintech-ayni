export const STAFF_AUTHENTICATOR = Symbol('STAFF_AUTHENTICATOR');

/** Roles del personal interno (docs/backoffice-plan.md). */
export const STAFF_ROLES = ['support', 'operations', 'finance', 'admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Persona del personal autenticada en la petición. */
export interface StaffPrincipal {
  readonly staffId: string;
  /** Para mostrarlo y auditarlo; no todos los proveedores lo envían en el access token. */
  readonly email?: string;
  readonly roles: readonly StaffRole[];
  /** Cuándo se autenticó por última vez; las acciones críticas piden que sea reciente (step-up). */
  readonly authenticatedAt: Date;
}

/**
 * Valida el token del personal, distinto del de la app (otra audiencia y otras claves). Lanza
 * `UnauthorizedError` si no es válido. Según `STAFF_AUTH_PROVIDER`: `UnconfiguredStaffAuthenticator`
 * rechaza todo, `OidcStaffAuthenticator` valida al proveedor de identidad (SSO + MFA) y
 * `DevStaffTokens` emite tokens locales solo en desarrollo.
 */
export interface StaffAuthenticatorPort {
  authenticate(accessToken: string): Promise<StaffPrincipal>;
}
