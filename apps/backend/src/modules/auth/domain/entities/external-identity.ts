/**
 * Identidad externa: la cuenta de la persona en Google o Apple, vinculada a su usuario de Ayni
 * (COPAYNI-91). Vive aparte de `User` para que una misma cuenta pueda tener varios proveedores y
 * para que el perfil local no quede atado a ninguno.
 */
export const IDENTITY_PROVIDERS = ['google', 'apple'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const isIdentityProvider = (value: string): value is IdentityProvider =>
  (IDENTITY_PROVIDERS as readonly string[]).includes(value);

/**
 * Lo que el proveedor afirma de la persona, ya verificado criptográficamente. `subject` es el
 * `sub` del token: el único identificador estable. El email es un atributo, **nunca** la clave:
 * cambia, y Apple puede no volver a entregarlo.
 */
export interface VerifiedIdentity {
  provider: IdentityProvider;
  subject: string;
  /** Solo si el proveedor lo entrega **y** lo declara verificado. */
  email: string | null;
  /** Apple con "Ocultar mi correo": el email es un alias de reenvío de Apple. */
  privateEmail: boolean;
  firstName: string | null;
  lastName: string | null;
}

export interface ExternalIdentity {
  id: string;
  userId: string;
  provider: IdentityProvider;
  subject: string;
  /** El email que el proveedor dio al vincular; informativo, no se usa para resolver la cuenta. */
  email: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}
