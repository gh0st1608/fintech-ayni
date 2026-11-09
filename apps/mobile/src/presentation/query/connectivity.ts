import { createContext, useContext, useSyncExternalStore } from 'react';

import { AppError, type AppErrorKind } from '@/domain/shared/errors/AppError';

const INCONCLUSIVE: ReadonlySet<AppErrorKind> = new Set(['timeout', 'cancelled', 'unknown']);

type Listener = () => void;

/**
 * Detecta la falta de conexión por los resultados de las propias peticiones (pending-scope D10):
 * un error de red la marca y la primera respuesta exitosa la levanta. Sin dependencias nativas;
 * cuando se agregue un detector del sistema (NetInfo), puede alimentar este mismo estado.
 */
export class ConnectivityTracker {
  private offline = false;
  private readonly listeners = new Set<Listener>();

  /**
   * Un error de red indica que no hay conexión. Un error que respondió el servidor (negocio,
   * validación, 5xx…) prueba que sí la hay. Un timeout o una cancelación no dicen nada.
   */
  reportError(error: unknown): void {
    if (!(error instanceof AppError)) return;
    if (error.kind === 'network') this.set(true);
    else if (!INCONCLUSIVE.has(error.kind)) this.set(false);
  }

  /** Una respuesta del servidor, aunque sea un error de negocio, prueba que hay conexión. */
  reportResponse(): void {
    this.set(false);
  }

  isOffline(): boolean {
    return this.offline;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(offline: boolean): void {
    if (this.offline === offline) return;
    this.offline = offline;
    this.listeners.forEach((listener) => listener());
  }
}

export const ConnectivityContext = createContext<ConnectivityTracker | null>(null);

/** `true` mientras la última petición falló por falta de red. */
export function useOffline(): boolean {
  const tracker = useContext(ConnectivityContext);
  return useSyncExternalStore(
    (listener) => tracker?.subscribe(listener) ?? (() => {}),
    () => tracker?.isOffline() ?? false,
  );
}
