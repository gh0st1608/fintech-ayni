import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import type { SessionStatus } from '@/domain/auth/SessionStatus';

import { useContainer } from './ContainerProvider';

interface SessionContextValue {
  status: SessionStatus;
  /** Aplica el estado devuelto por un caso de uso que ya guardó la sesión (p. ej. VerifyOtp). */
  completeSignIn(status: SessionStatus): void;
  /**
   * Sale de `locked`. Si mientras tanto la sesión cambió (p. ej. se cerró), no hace nada: una
   * verificación que responde tarde no puede reabrir el área privada.
   */
  unlock(): void;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Expone el estado de sesión a la UI; las reglas viven en los casos de uso de auth. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useContainer();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('checking');

  useEffect(() => {
    let mounted = true;
    auth.restoreSession.execute().then((restored) => {
      if (mounted) setStatus(restored);
    });
    return () => {
      mounted = false;
    };
  }, [auth.restoreSession]);

  // Una expiración detectada por la capa HTTP cierra la sesión sin bucles: no se reintenta.
  useEffect(
    () =>
      auth.sessionEvents.subscribe((next) => {
        queryClient.clear();
        setStatus(next);
      }),
    [auth.sessionEvents, queryClient],
  );

  // Al volver de segundo plano tras un rato, la sesión se bloquea si hay biometría (COPAYNI-22).
  useEffect(() => {
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt = Date.now();
      } else if (state === 'active' && backgroundedAt !== null) {
        const backgroundMs = Date.now() - backgroundedAt;
        backgroundedAt = null;
        void auth.shouldRelock.execute(backgroundMs).then((lock) => {
          if (lock) setStatus((current) => (current === 'authenticated' ? 'locked' : current));
        });
      }
    });
    return () => subscription.remove();
  }, [auth.shouldRelock]);

  const completeSignIn = useCallback((next: SessionStatus) => setStatus(next), []);

  const unlock = useCallback(
    () => setStatus((current) => (current === 'locked' ? 'authenticated' : current)),
    [],
  );

  const signOut = useCallback(async () => {
    const next = await auth.signOut.execute();
    queryClient.clear();
    setStatus(next);
  }, [auth.signOut, queryClient]);

  const value = useMemo(
    () => ({ status, completeSignIn, unlock, signOut }),
    [status, completeSignIn, unlock, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within SessionProvider');
  return session;
}
