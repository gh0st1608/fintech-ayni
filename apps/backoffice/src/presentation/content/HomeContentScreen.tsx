import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  BACKGROUND_COLORS,
  BACKGROUND_LABELS,
  backgroundsOf,
  CONTENT_LANGUAGE_LABELS,
  CONTENT_LANGUAGES,
  CONTENT_TARGETS,
  type ContentInput,
  type ContentItem,
  type ContentKind,
  type ContentTarget,
  type ContentTexts,
  ILLUSTRATION_LABELS,
  ILLUSTRATIONS,
  type Illustration,
  LIMITS,
  MAX_ITEMS,
  TARGET_LABELS,
} from '@/domain/content/HomeContent';
import { can } from '@/domain/staff/Staff';

import { Button, Dialog, ErrorAlert, Field, inputClass, Spinner } from '../components/ui';
import { formatDateTime } from '../format';
import { useContainer, useStaff } from '../providers/AppProviders';

const homeContentKey = ['home-content'] as const;

const KIND_LABELS: Record<ContentKind, { one: string; many: string; help: string }> = {
  offer: {
    one: 'oferta',
    many: 'Ofertas del carrusel',
    help: 'Las láminas que giran arriba de Home. Fuera de su vigencia dejan de mostrarse solas.',
  },
  goal: {
    one: 'meta',
    many: 'Metas populares',
    help: 'Las tarjetas de colores de abajo. Un atajo a lo que la persona puede hacer hoy.',
  },
};

const emptyTexts = (): ContentTexts => ({
  es: { title: '', subtitle: null },
  en: { title: '', subtitle: null },
});

const toInput = (item: ContentItem): ContentInput => ({
  texts: structuredClone(item.texts),
  illustration: item.illustration,
  background: item.background,
  target: item.target,
  targetAmount: item.targetAmount,
  position: item.position,
  active: item.active,
  startsOn: item.startsOn ? item.startsOn.toISOString().slice(0, 10) : null,
  endsOn: item.endsOn ? item.endsOn.toISOString().slice(0, 10) : null,
});

const blank = (kind: ContentKind, position: number): ContentInput => ({
  texts: emptyTexts(),
  illustration: 'megaphone',
  background: backgroundsOf(kind)[0] ?? 'cream',
  target: 'none',
  targetAmount: null,
  position,
  active: true,
  startsOn: null,
  endsOn: null,
});

/**
 * Contenido de Home (COPAYNI-25): ofertas y metas populares. Lo que se guarda se publica al
 * instante en la app, sin publicar una versión nueva. El destino sale de una lista cerrada de
 * pantallas: desde aquí no se puede mandar a nadie fuera de la app.
 */
export function HomeContentScreen() {
  const { homeContent } = useContainer();
  const content = useQuery({
    queryKey: homeContentKey,
    queryFn: ({ signal }) => homeContent.get.execute(signal),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Contenido de Home</h1>
        <p className="text-sm text-ink-soft">
          Lo que se guarda se publica al instante en la app. Una sección sin tarjetas activas no se
          muestra. Las ilustraciones son las que ya trae la app.
        </p>
      </header>
      {content.isPending && <Spinner label="Cargando el contenido" />}
      {content.isError && (
        <ErrorAlert error={content.error} onRetry={() => void content.refetch()} />
      )}
      {content.isSuccess && (
        <>
          <ContentList kind="offer" items={content.data.offers} />
          <ContentList kind="goal" items={content.data.goals} />
        </>
      )}
    </section>
  );
}

function ContentList({ kind, items }: { kind: ContentKind; items: ContentItem[] }) {
  const staff = useStaff();
  // Dos estados en vez de un centinela: o se está creando una, o se está editando una existente.
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const labels = KIND_LABELS[kind];
  const editable = can(staff, 'help.edit');

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{labels.many}</h2>
          <p className="text-sm text-ink-soft">{labels.help}</p>
        </div>
        {editable && !creating && (
          <Button
            variant="secondary"
            disabled={items.length >= MAX_ITEMS}
            onClick={() => setCreating(true)}
          >
            Agregar {labels.one}
          </Button>
        )}
      </header>

      {items.length === 0 && !creating && (
        <p className="text-sm text-ink-soft">
          No hay {labels.one}s cargadas: la sección no aparece en la app.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id}>
              <ContentForm
                kind={kind}
                id={item.id}
                initial={toInput(item)}
                onClose={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={item.id}>
              <ContentRow
                kind={kind}
                item={item}
                editable={editable}
                onEdit={() => setEditingId(item.id)}
              />
            </li>
          ),
        )}
      </ul>

      {creating && (
        <ContentForm
          kind={kind}
          id={null}
          initial={blank(kind, items.length)}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function ContentRow({
  kind,
  item,
  editable,
  onEdit,
}: {
  kind: ContentKind;
  item: ContentItem;
  editable: boolean;
  onEdit: () => void;
}) {
  const staff = useStaff();
  const { homeContent } = useContainer();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => homeContent.remove.execute(staff, kind, item.id),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: homeContentKey });
    },
  });
  const color = BACKGROUND_COLORS[item.background as keyof typeof BACKGROUND_COLORS];

  return (
    <article className="flex items-center gap-3 rounded-md border border-line p-3">
      <span
        aria-hidden="true"
        className="size-10 shrink-0 rounded-md"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.texts.es.title}</p>
        <p className="truncate text-sm text-ink-soft">
          {TARGET_LABELS[item.target]}
          {item.texts.es.subtitle ? ` · ${item.texts.es.subtitle}` : ''}
          {item.texts.en.title ? '' : ' · sin inglés'}
        </p>
        <p className="text-xs text-ink-soft">
          {item.active ? 'Activa' : 'Apagada'}
          {item.endsOn ? ` · hasta el ${formatDateTime(item.endsOn)}` : ''} · actualizada{' '}
          {formatDateTime(item.updatedAt)}
          {item.updatedBy ? ` por ${item.updatedBy}` : ''}
        </p>
      </div>
      {editable && (
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Borrar
          </Button>
        </div>
      )}
      {remove.isError && <ErrorAlert error={remove.error} />}
      <Dialog open={confirming} title="Borrar esta tarjeta" onClose={() => setConfirming(false)}>
        <p className="mb-4 text-sm">
          Se borra <strong>{item.texts.es.title}</strong> y deja de verse en la app. Si solo quieres
          sacarla un tiempo, apágala en vez de borrarla.
        </p>
        <div className="flex gap-2">
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Borrar
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </Dialog>
    </article>
  );
}

function ContentForm({
  kind,
  id,
  initial,
  onClose,
}: {
  kind: ContentKind;
  id: string | null;
  initial: ContentInput;
  onClose: () => void;
}) {
  const staff = useStaff();
  const { homeContent } = useContainer();
  const queryClient = useQueryClient();
  const [input, setInput] = useState<ContentInput>(initial);
  const limits = LIMITS[kind];

  const save = useMutation({
    mutationFn: () => homeContent.save.execute(staff, kind, id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeContentKey });
      onClose();
    },
  });

  const setText = (language: 'es' | 'en', field: 'title' | 'subtitle', value: string) =>
    setInput((current) => ({
      ...current,
      texts: {
        ...current.texts,
        [language]: {
          ...current.texts[language],
          [field]: field === 'subtitle' ? value || null : value,
        },
      },
    }));

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-line bg-canvas p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      {CONTENT_LANGUAGES.map((language) => (
        <fieldset key={language} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            {CONTENT_LANGUAGE_LABELS[language]}
            {language === 'en' ? ' (opcional: sin esto, la app muestra el español)' : ''}
          </legend>
          <Field label={`Título (${language})`}>
            {(field) => (
              <input
                {...field}
                className={inputClass}
                maxLength={limits.title}
                value={input.texts[language].title}
                onChange={(event) => setText(language, 'title', event.target.value)}
              />
            )}
          </Field>
          <Field label={`Subtítulo (${language})`}>
            {(field) => (
              <input
                {...field}
                className={inputClass}
                maxLength={limits.subtitle}
                value={input.texts[language].subtitle ?? ''}
                onChange={(event) => setText(language, 'subtitle', event.target.value)}
              />
            )}
          </Field>
        </fieldset>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ilustración">
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={input.illustration}
              onChange={(event) =>
                setInput({ ...input, illustration: event.target.value as Illustration })
              }
            >
              {ILLUSTRATIONS.map((value) => (
                <option key={value} value={value}>
                  {ILLUSTRATION_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Color">
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={input.background}
              onChange={(event) => setInput({ ...input, background: event.target.value })}
            >
              {backgroundsOf(kind).map((value) => (
                <option key={value} value={value}>
                  {BACKGROUND_LABELS[value as keyof typeof BACKGROUND_LABELS]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Destino">
          {(field) => (
            <select
              {...field}
              className={inputClass}
              value={input.target}
              onChange={(event) =>
                setInput({
                  ...input,
                  target: event.target.value as ContentTarget,
                  // El monto solo tiene sentido al mandar al flujo de unión.
                  targetAmount: event.target.value === 'join_circle' ? input.targetAmount : null,
                })
              }
            >
              {CONTENT_TARGETS.map((value) => (
                <option key={value} value={value}>
                  {TARGET_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {input.target === 'join_circle' && (
          <Field label="Monto precargado (en soles)">
            {(field) => (
              <input
                {...field}
                className={inputClass}
                type="number"
                min={1}
                value={input.targetAmount === null ? '' : input.targetAmount / 100}
                onChange={(event) =>
                  setInput({
                    ...input,
                    targetAmount: event.target.value
                      ? Math.round(Number(event.target.value) * 100)
                      : null,
                  })
                }
              />
            )}
          </Field>
        )}
        <Field label="Orden">
          {(field) => (
            <input
              {...field}
              className={inputClass}
              type="number"
              min={0}
              value={input.position}
              onChange={(event) => setInput({ ...input, position: Number(event.target.value) })}
            />
          )}
        </Field>
        {kind === 'offer' && (
          <>
            <Field label="Se muestra desde">
              {(field) => (
                <input
                  {...field}
                  className={inputClass}
                  type="date"
                  value={input.startsOn ?? ''}
                  onChange={(event) => setInput({ ...input, startsOn: event.target.value || null })}
                />
              )}
            </Field>
            <Field label="Se muestra hasta">
              {(field) => (
                <input
                  {...field}
                  className={inputClass}
                  type="date"
                  value={input.endsOn ?? ''}
                  onChange={(event) => setInput({ ...input, endsOn: event.target.value || null })}
                />
              )}
            </Field>
          </>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-brand"
          checked={input.active}
          onChange={(event) => setInput({ ...input, active: event.target.checked })}
        />
        Activa en la app
      </label>

      {save.isError && <ErrorAlert error={save.error} />}

      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
