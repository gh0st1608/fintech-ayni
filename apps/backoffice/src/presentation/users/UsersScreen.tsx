import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { isExactUserQuery, USER_STATUS_LABELS } from '@/domain/users/User';

import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime } from '../format';
import { useUserSearch } from './useUsers';

const HINT = 'Email completo, teléfono con código de país (+51…) o id. No busca por partes.';

/**
 * Búsqueda de personas para soporte (docs/backoffice-plan.md, fase 2). La búsqueda enviada vive en
 * la URL (`?q=`), así se puede compartir el enlace con otra persona del equipo.
 */
export function UsersScreen() {
  const [params, setParams] = useSearchParams();
  const submitted = params.get('q');
  const [draft, setDraft] = useState(submitted ?? '');
  const [draftError, setDraftError] = useState<string | null>(null);
  const valid = submitted !== null && isExactUserQuery(submitted);
  const search = useUserSearch(valid ? submitted.trim() : null);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Personas</h1>
        <p className="text-sm text-ink-soft">Cada búsqueda queda registrada en la auditoría.</p>
      </header>

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isExactUserQuery(draft)) {
            setDraftError(
              'Escribe el email completo, el teléfono con código de país (+51…) o el id',
            );
            return;
          }
          setDraftError(null);
          setParams({ q: draft.trim() });
        }}
      >
        <div className="w-full sm:w-96">
          <Field label="Buscar persona" error={draftError} hint={HINT}>
            {(field) => (
              <input
                {...field}
                type="search"
                autoComplete="off"
                className={inputClass}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit" loading={search.isFetching}>
          Buscar
        </Button>
      </form>

      {submitted === null && <EmptyState title="Busca a una persona" description={HINT} />}
      {submitted !== null && !valid && (
        <EmptyState title="Esa búsqueda no es válida" description={HINT} />
      )}
      {search.isPending && valid && <Spinner label="Buscando" />}
      {search.isError && <ErrorAlert error={search.error} onRetry={() => void search.refetch()} />}
      {search.isSuccess && search.data.length === 0 && (
        <EmptyState
          title="No encontramos a nadie con ese dato"
          description="Revisa que esté completo y bien escrito."
        />
      )}
      {search.isSuccess && search.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {search.data.map((user) => (
            <li
              key={user.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-col">
                <Link
                  to={`/users/${user.userId}`}
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  {user.name ?? user.email ?? user.phone ?? user.userId}
                </Link>
                <span className="text-sm text-ink-soft">
                  {[user.email, user.phone].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
                  {USER_STATUS_LABELS[user.status]}
                </Badge>
                <span className="text-ink-soft">Desde {formatDateTime(user.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
