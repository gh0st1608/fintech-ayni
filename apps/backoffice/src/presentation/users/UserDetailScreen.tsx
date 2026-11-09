import { Link, useParams } from 'react-router';

import { KYC_TYPE_LABELS, KYC_TYPES } from '@/domain/kyc/Kyc';
import { AppError } from '@/domain/shared/AppError';
import { can } from '@/domain/staff/Staff';
import {
  KYC_DOCUMENT_STATE_LABELS,
  type KycDocumentState,
  USER_STATUS_LABELS,
  type UserDetail,
} from '@/domain/users/User';

import { Badge, EmptyState, ErrorAlert, Spinner } from '../components/ui';
import { formatDateTime, formatMoney, STATE_LABELS } from '../format';
import { useStaff } from '../providers/AppProviders';
import { useUser } from './useUsers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KYC_TONE: Record<KycDocumentState, 'neutral' | 'warning' | 'success' | 'danger'> = {
  not_submitted: 'neutral',
  in_review: 'warning',
  approved: 'success',
  rejected: 'danger',
};

/** Perfil de una persona para soporte: datos enmascarados, estado del KYC y sus juntas. */
export function UserDetailScreen() {
  const { userId = '' } = useParams();
  if (!UUID.test(userId)) {
    return <EmptyState title="Esa persona no existe" description="Revisa el enlace." />;
  }
  return <UserDetailContent userId={userId} />;
}

function UserDetailContent({ userId }: { userId: string }) {
  const user = useUser(userId);
  if (user.isPending) return <Spinner label="Cargando la persona" />;
  if (user.isError) {
    if (user.error instanceof AppError && user.error.kind === 'not_found') {
      return (
        <EmptyState title="Esa persona no existe" description="Puede que el enlace esté mal." />
      );
    }
    return <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />;
  }
  return <UserView user={user.data} />;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function UserView({ user }: { user: UserDetail }) {
  const staff = useStaff();
  const canSeeCircles = can(staff, 'circles.read');

  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Ruta">
        <Link to="/users" className="text-sm text-brand hover:underline">
          ← Personas
        </Link>
      </nav>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{user.name ?? 'Persona sin nombre'}</h1>
        <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
          {USER_STATUS_LABELS[user.status]}
        </Badge>
      </header>

      <p className="text-xs text-ink-soft">Los datos personales se muestran enmascarados.</p>
      <dl className="grid grid-cols-1 gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-4">
        <Info label="Email" value={user.email ?? '—'} />
        <Info label="Teléfono" value={user.phone ?? '—'} />
        <Info label="Idioma" value={user.preferredLanguage ?? '—'} />
        <Info label="Registrada" value={formatDateTime(user.createdAt)} />
      </dl>

      <section aria-labelledby="kyc" className="flex flex-col gap-2">
        <h2 id="kyc" className="text-lg font-semibold">
          Documentos
        </h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {KYC_TYPES.map((type) => (
            <li
              key={type}
              className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-3"
            >
              <span className="text-sm">{KYC_TYPE_LABELS[type]}</span>
              <Badge tone={KYC_TONE[user.kyc[type]]}>
                {KYC_DOCUMENT_STATE_LABELS[user.kyc[type]]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="circles" className="flex flex-col gap-2">
        <h2 id="circles" className="text-lg font-semibold">
          Juntas
        </h2>
        {user.circles.length === 0 ? (
          <EmptyState title="No está en ninguna junta" />
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <caption className="sr-only">Juntas de la persona</caption>
              <thead className="bg-muted text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Pozo
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Turno
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Se unió
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {user.circles.map((circle) => (
                  <tr key={circle.circleId}>
                    <td className="px-4 py-2">
                      {canSeeCircles ? (
                        <Link
                          to={`/circles/${circle.circleId}`}
                          className="font-medium text-brand underline-offset-2 hover:underline"
                        >
                          {formatMoney(circle.payout)}
                        </Link>
                      ) : (
                        formatMoney(circle.payout)
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {STATE_LABELS[circle.state]}
                      {circle.expelledAt && (
                        <span className="ml-2">
                          <Badge tone="danger">Expulsada</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {circle.position} de {circle.months}
                    </td>
                    <td className="px-4 py-2">{formatDateTime(circle.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
