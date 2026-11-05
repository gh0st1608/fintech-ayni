/**
 * Estados de sesión. La fuente de verdad es el almacén de tokens; las rutas protegidas
 * no sustituyen la autorización del backend. `locked`: hay sesión, pero falta desbloquearla antes
 * de mostrar datos (COPAYNI-22).
 */
export type SessionStatus =
  'checking' | 'unauthenticated' | 'authenticated' | 'locked' | 'sessionExpired';
