import { Navigate, NavLink, Outlet, type RouteObject, useLocation } from 'react-router';

import { can, ROLE_LABELS } from '@/domain/staff/Staff';

import { LoginScreen } from '../auth/LoginScreen';
import { CircleDetailScreen } from '../circles/CircleDetailScreen';
import { CirclesScreen } from '../circles/CirclesScreen';
import { Button, EmptyState, Spinner } from '../components/ui';
import { KycQueueScreen } from '../kyc/KycQueueScreen';
import { KycReviewScreen } from '../kyc/KycReviewScreen';
import { UserDetailScreen } from '../users/UserDetailScreen';
import { UsersScreen } from '../users/UsersScreen';
import { FinanceScreen } from '../finance/FinanceScreen';
import { useSession, useStaff } from '../providers/AppProviders';

/** Rutas privadas: sin sesión, al login, recordando a dónde se quería ir. */
function RequireSession() {
  const { session } = useSession();
  const location = useLocation();
  if (session.status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner label="Verificando la sesión" />
      </main>
    );
  }
  if (session.status === 'signed_out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Layout />;
}

function Layout() {
  const staff = useStaff();
  const { signOut } = useSession();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-muted text-ink' : 'text-ink-soft hover:text-ink'}`;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        Saltar al contenido
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">Ayni · Back-office</span>
            <nav aria-label="Principal" className="flex gap-1">
              {can(staff, 'circles.read') && (
                <NavLink to="/circles" className={navClass}>
                  Juntas
                </NavLink>
              )}
              {can(staff, 'users.read') && (
                <NavLink to="/users" className={navClass}>
                  Personas
                </NavLink>
              )}
              {can(staff, 'finance.read') && (
                <NavLink to="/finance" className={navClass}>
                  Finanzas
                </NavLink>
              )}
              {can(staff, 'kyc.review') && (
                <NavLink to="/kyc" className={navClass}>
                  Documentos
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-soft">
              {staff.email ?? staff.staffId} ·{' '}
              {staff.roles.map((role) => ROLE_LABELS[role]).join(', ')}
            </span>
            <Button variant="secondary" onClick={signOut}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Sin el permiso, la ruta explica por qué no se muestra. El backend igual lo rechazaría. */
function RequirePermission({ permission }: { permission: Parameters<typeof can>[1] }) {
  const staff = useStaff();
  if (!can(staff, permission)) {
    return <EmptyState title="Tu rol no tiene acceso a esta sección" />;
  }
  return <Outlet />;
}

function Home() {
  const staff = useStaff();
  if (can(staff, 'kyc.review')) return <Navigate to="/kyc" replace />;
  if (can(staff, 'circles.read')) return <Navigate to="/circles" replace />;
  return (
    <EmptyState
      title="No hay secciones para tu rol todavía"
      description="La gestión del personal llega en una fase siguiente del back-office."
    />
  );
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginScreen /> },
  {
    element: <RequireSession />,
    children: [
      { index: true, element: <Home /> },
      {
        element: <RequirePermission permission="circles.read" />,
        children: [
          { path: '/circles', element: <CirclesScreen /> },
          { path: '/circles/:circleId', element: <CircleDetailScreen /> },
        ],
      },
      {
        element: <RequirePermission permission="kyc.review" />,
        children: [
          { path: '/kyc', element: <KycQueueScreen /> },
          { path: '/kyc/:id', element: <KycReviewScreen /> },
        ],
      },
      {
        element: <RequirePermission permission="users.read" />,
        children: [
          { path: '/users', element: <UsersScreen /> },
          { path: '/users/:userId', element: <UserDetailScreen /> },
        ],
      },
      {
        element: <RequirePermission permission="finance.read" />,
        children: [{ path: '/finance', element: <FinanceScreen /> }],
      },
      { path: '*', element: <EmptyState title="No encontramos esta página" /> },
    ],
  },
];
