import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { SessionStatus } from '@/domain/auth/SessionStatus';

import { useContainer } from './ContainerProvider';

interface SessionContextValue {
  status: SessionStatus;
  signIn(credentials: { accessToken: string; refreshToken: string }): Promise<void>;
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

  const signIn = useCallback<SessionContextValue['signIn']>(
    async (credentials) => setStatus(await auth.signIn.execute(credentials)),
    [auth.signIn],
  );

  const signOut = useCallback(async () => {
    const next = await auth.signOut.execute();
    queryClient.clear();
    setStatus(next);
  }, [auth.signOut, queryClient]);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within SessionProvider');
  return session;
}
