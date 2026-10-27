import type { SessionStatus } from '@/domain/auth/SessionStatus';

type SessionListener = (status: SessionStatus) => void;

/**
 * Avisa a la presentación de cambios de sesión que nacen fuera de la UI, como la expiración
 * detectada por una petición HTTP. Sin dependencias de framework.
 */
export class SessionEvents {
  private readonly listeners = new Set<SessionListener>();

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(status: SessionStatus): void {
    this.listeners.forEach((listener) => listener(status));
  }
}
