import type {
  CircleDetail,
  CirclesPage,
  CycleState,
  PauseAction,
  PauseResult,
} from './circles/Circle';
import type { StaffMember, StaffRole } from './staff/Staff';

/** Credenciales del inicio de sesión de desarrollo (`STAFF_AUTH_PROVIDER=dev` en el backend). */
export interface DevCredentials {
  email: string;
  roles: StaffRole[];
}

/**
 * Sesión del personal. El token vive solo en memoria: nunca en LocalStorage (base técnica §11).
 * El modo OIDC (Cognito, BO2) implementará este mismo puerto.
 */
export interface StaffAuthPort {
  signIn(credentials: DevCredentials): Promise<StaffMember>;
  current(signal?: AbortSignal): Promise<StaffMember | null>;
  signOut(): void;
}

export interface CirclesFilter {
  state?: CycleState;
  cursor?: string | null;
  limit?: number;
}

export interface CirclesRepositoryPort {
  list(filter: CirclesFilter, signal?: AbortSignal): Promise<CirclesPage>;
  get(circleId: string, signal?: AbortSignal): Promise<CircleDetail>;
  setPause(circleId: string, action: PauseAction, reason: string): Promise<PauseResult>;
}
