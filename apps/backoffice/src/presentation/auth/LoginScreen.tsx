import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';

import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/domain/staff/Staff';

import { Button, ErrorAlert, Field, inputClass } from '../components/ui';
import { useSession } from '../providers/AppProviders';

/**
 * Inicio de sesión. En modo OIDC muestra un botón que inicia el flujo PKCE hacia IAM Identity
 * Center. En modo dev muestra el formulario de email + roles para desarrollo local.
 */
export function LoginScreen() {
  const { session, signIn, initiateOidcFlow } = useSession();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<StaffRole[]>(['operations']);
  const login = useMutation({ mutationFn: () => signIn({ email, roles }) });
  const from = (location.state as { from?: string } | null)?.from ?? '/circles';

  if (session.status === 'signed_in') return <Navigate to={from} replace />;

  const toggle = (role: StaffRole) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((value) => value !== role) : [...current, role],
    );

  if (initiateOidcFlow) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-line bg-surface p-6 shadow-sm text-center">
          <div>
            <h1 className="text-xl font-semibold">Back-office de Ayni</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Inicia sesión con tu cuenta corporativa. Se requerirá MFA.
            </p>
          </div>
          <Button onClick={() => initiateOidcFlow(from)}>Iniciar sesión con SSO</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-line bg-surface p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Back-office de Ayni</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Acceso de desarrollo: elige con qué roles entrar.
          </p>
        </div>
        <Field label="Email">
          {(field) => (
            <input
              {...field}
              type="email"
              autoComplete="username"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Roles</legend>
          {STAFF_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggle(role)}
                className="size-4 accent-brand"
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </fieldset>
        {login.isError && <ErrorAlert error={login.error} />}
        <Button type="submit" loading={login.isPending}>
          Ingresar
        </Button>
      </form>
    </main>
  );
}
