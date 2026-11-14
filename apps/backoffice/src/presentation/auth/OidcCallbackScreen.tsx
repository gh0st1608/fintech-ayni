import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { AppError } from '@/domain/shared/AppError';

import { ErrorAlert, Spinner } from '../components/ui';
import { useSession } from '../providers/AppProviders';

const SESSION_RETURN_TO_KEY = 'oidc_return_to';

/**
 * Pantalla pública en `/auth/callback`. Recibe el código de autorización de IAM Identity Center,
 * intercambia por un token y redirige al destino original (o a `/`).
 */
export function OidcCallbackScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { handleOidcCallback } = useSession();
  const [callbackError, setCallbackError] = useState<AppError | Error | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = params.get('code');
    const state = params.get('state');
    const providerError = params.get('error');

    if (providerError) {
      void navigate('/login', { replace: true, state: { oidcError: providerError } });
      return;
    }

    if (!code || !state || !handleOidcCallback) {
      void navigate('/login', { replace: true });
      return;
    }

    let returnTo = '/';
    try {
      returnTo = sessionStorage.getItem(SESSION_RETURN_TO_KEY) ?? '/';
      sessionStorage.removeItem(SESSION_RETURN_TO_KEY);
    } catch {
      /* sessionStorage blocked */
    }

    handleOidcCallback(code, state)
      .then(() => navigate(returnTo, { replace: true }))
      .catch((err: unknown) => {
        setCallbackError(
          err instanceof Error
            ? err
            : new AppError('unauthorized', 'Error al completar el inicio de sesión'),
        );
      });
  }, [params, navigate, handleOidcCallback]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      {callbackError ? (
        <div className="w-full max-w-sm">
          <ErrorAlert error={callbackError} />
        </div>
      ) : (
        <Spinner label="Completando inicio de sesión…" />
      )}
    </main>
  );
}
