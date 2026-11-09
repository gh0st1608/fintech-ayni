import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AppContainer } from '@/bootstrap/container';
import type { DevCredentials } from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import type { StaffMember } from '@/domain/staff/Staff';

const ContainerContext = createContext<AppContainer | null>(null);

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('useContainer debe usarse dentro de AppProviders');
  return container;
}

/** Reintenta lecturas solo ante fallos transitorios, como mucho 2 veces. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) => failures < 2 && error instanceof AppError && error.retryable,
      },
      mutations: { retry: false },
    },
  });
}

type SessionState =
  { status: 'checking' } | { status: 'signed_out' } | { status: 'signed_in'; staff: StaffMember };

interface SessionValue {
  session: SessionState;
  signIn: (credentials: DevCredentials) => Promise<StaffMember>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession debe usarse dentro de AppProviders');
  return session;
}

/** La sesión del personal que está usando el back-office. */
export function useStaff(): StaffMember {
  const { session } = useSession();
  if (session.status !== 'signed_in') throw new Error('useStaff requiere una sesión iniciada');
  return session.staff;
}

function SessionProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useContainer();
  const currentStaff = auth.current;
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState>({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    currentStaff
      .execute(controller.signal)
      .then((staff) => {
        setSession(staff ? { status: 'signed_in', staff } : { status: 'signed_out' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession({ status: 'signed_out' });
      });
    return () => controller.abort();
  }, [currentStaff]);

  const signIn = useCallback(
    async (credentials: DevCredentials) => {
      const staff = await auth.signIn.execute(credentials);
      setSession({ status: 'signed_in', staff });
      return staff;
    },
    [auth.signIn],
  );

  const signOut = useCallback(() => {
    auth.signOut.execute();
    // Nada de lo que vio una persona queda en caché para la siguiente.
    queryClient.clear();
    setSession({ status: 'signed_out' });
  }, [auth.signOut, queryClient]);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function AppProviders({
  container,
  queryClient,
  children,
}: {
  container: AppContainer;
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <ContainerContext.Provider value={container}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </ContainerContext.Provider>
  );
}
