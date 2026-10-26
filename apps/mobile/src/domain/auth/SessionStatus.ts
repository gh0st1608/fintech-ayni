/**
 * Estados de sesión. La fuente de verdad es el almacén de tokens; las rutas protegidas
 * no sustituyen la autorización del backend.
 */
export type SessionStatus = 'checking' | 'unauthenticated' | 'authenticated' | 'sessionExpired';
