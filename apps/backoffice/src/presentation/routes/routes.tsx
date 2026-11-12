import { Navigate, NavLink, Outlet, type RouteObject, useLocation } from 'react-router';

import { can, ROLE_LABELS } from '@/domain/staff/Staff';

import { LoginScreen } from '../auth/LoginScreen';
import { Button, EmptyState, Spinner } from '../components/ui';
import { useSession, useStaff } from '../providers/AppProviders';

/**
 * Cada sección se descarga recién al visitarla (`lazy` de React Router): el bundle inicial solo
 * trae el login y el layout. Quien solo revisa KYC nunca descarga finanzas.
 */
const screen = (
  load: () => Promise<React.ComponentType>,
): Pick<RouteObject, 'lazy' | 'errorElement'> => ({
  lazy: async () => ({ Component: await load() }),
  errorElement: (
    <div role="alert" className="space-y-4">
      <EmptyState
        title="No se pudo cargar esta sección"
        description="Recarga la aplicación para volver a intentarlo."
      />
      <Button onClick={() => window.location.reload()}>Recargar aplicación</Button>
    </div>
  ),
});

const CIRCLES = () => import('../circles/CirclesScreen').then((m) => m.CirclesScreen);
const CIRCLE_DETAIL = () =>
  import('../circles/CircleDetailScreen').then((m) => m.CircleDetailScreen);
const CYCLE_RUNS = () => import('../cycle-runs/CycleRunsScreen').then((m) => m.CycleRunsScreen);
const KYC_QUEUE = () => import('../kyc/KycQueueScreen').then((m) => m.KycQueueScreen);
const KYC_REVIEW = () => import('../kyc/KycReviewScreen').then((m) => m.KycReviewScreen);
const USERS = () => import('../users/UsersScreen').then((m) => m.UsersScreen);
const USER_DETAIL = () => import('../users/UserDetailScreen').then((m) => m.UserDetailScreen);
const FINANCE = () => import('../finance/FinanceScreen').then((m) => m.FinanceScreen);
const HELP = () => import('../help/HelpEditorScreen').then((m) => m.HelpEditorScreen);

/** Mientras se descarga la primera pantalla de la sesión. */
function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Spinner label="Cargando" />
    </main>
  );
}

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
              {can(staff, 'circles.read') && (
                <NavLink to="/cycle-runs" className={navClass}>
                  Ciclo mensual
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
              {can(staff, 'help.read') && (
                <NavLink to="/help" className={navClass}>
                  Ayuda
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
    hydrateFallbackElement: <LoadingScreen />,
    children: [
      { index: true, element: <Home /> },
      {
        element: <RequirePermission permission="circles.read" />,
        children: [
          { path: '/circles', ...screen(CIRCLES) },
          { path: '/circles/:circleId', ...screen(CIRCLE_DETAIL) },
          { path: '/cycle-runs', ...screen(CYCLE_RUNS) },
        ],
      },
      {
        element: <RequirePermission permission="kyc.review" />,
        children: [
          { path: '/kyc', ...screen(KYC_QUEUE) },
          { path: '/kyc/:id', ...screen(KYC_REVIEW) },
        ],
      },
      {
        element: <RequirePermission permission="users.read" />,
        children: [
          { path: '/users', ...screen(USERS) },
          { path: '/users/:userId', ...screen(USER_DETAIL) },
        ],
      },
      {
        element: <RequirePermission permission="finance.read" />,
        children: [{ path: '/finance', ...screen(FINANCE) }],
      },
      {
        element: <RequirePermission permission="help.read" />,
        children: [{ path: '/help', ...screen(HELP) }],
      },
      { path: '*', element: <EmptyState title="No encontramos esta página" /> },
    ],
  },
];
