import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  type Faq,
  HELP_LANGUAGE_LABELS,
  HELP_LANGUAGES,
  type HelpContent,
  type HelpLanguage,
  MAX_ANSWER,
  MAX_FAQS,
  MAX_POLICY,
  MAX_QUESTION,
} from '@/domain/help/Help';
import { can } from '@/domain/staff/Staff';

import { Button, ErrorAlert, Field, inputClass, Spinner } from '../components/ui';
import { formatDateTime } from '../format';
import { useContainer, useStaff } from '../providers/AppProviders';

const helpKey = (language: HelpLanguage) => ['help', language] as const;

/**
 * Ayuda y política de pagos de la app (COPAYNI-83). Lo que se guarda se publica al instante; un
 * idioma sin contenido muestra el español en la app.
 */
export function HelpEditorScreen() {
  const [language, setLanguage] = useState<HelpLanguage>('es');
  const { help } = useContainer();
  const content = useQuery({
    queryKey: helpKey(language),
    queryFn: ({ signal }) => help.get.execute(language, signal),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Ayuda de la app</h1>
        <p className="text-sm text-ink-soft">
          Preguntas frecuentes y política de pagos. Se publican al guardar, sin actualizar la app.
          La política de pagos necesita la aprobación de Legal antes de publicarse.
        </p>
        <nav aria-label="Idiomas" className="flex gap-1">
          {HELP_LANGUAGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-current={language === value ? 'page' : undefined}
              onClick={() => setLanguage(value)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                language === value ? 'bg-muted text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {HELP_LANGUAGE_LABELS[value]}
            </button>
          ))}
        </nav>
      </header>
      {content.isPending && <Spinner label="Cargando la ayuda" />}
      {content.isError && (
        <ErrorAlert error={content.error} onRetry={() => void content.refetch()} />
      )}
      {content.isSuccess && <HelpForm key={language} content={content.data} />}
    </section>
  );
}

function HelpForm({ content }: { content: HelpContent }) {
  const staff = useStaff();
  const { help } = useContainer();
  const queryClient = useQueryClient();
  const editable = can(staff, 'help.edit');
  const [faqs, setFaqs] = useState<Faq[]>(
    content.faqs.map(({ question, answer }) => ({ question, answer })),
  );
  const [policy, setPolicy] = useState(content.paymentPolicy ?? '');
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      help.save.execute(staff, content.language, { faqs, paymentPolicy: policy || null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(helpKey(content.language), updated);
      setSaved(true);
    },
  });

  const update = (index: number, change: Partial<Faq>) => {
    setSaved(false);
    setFaqs((current) => current.map((faq, i) => (i === index ? { ...faq, ...change } : faq)));
  };
  const move = (index: number, offset: -1 | 1) =>
    setFaqs((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + offset, 0, item);
      return next;
    });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <section aria-labelledby="faqs" className="flex flex-col gap-3">
        <h2 id="faqs" className="text-lg font-semibold">
          Preguntas frecuentes
        </h2>
        {faqs.length === 0 && (
          <p className="text-sm text-ink-soft">Sin preguntas: la app mostrará las del español.</p>
        )}
        <ol className="flex flex-col gap-3">
          {faqs.map((faq, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
            >
              <Field label={`Pregunta ${String(index + 1)}`}>
                {(field) => (
                  <input
                    {...field}
                    className={inputClass}
                    maxLength={MAX_QUESTION}
                    disabled={!editable}
                    value={faq.question}
                    onChange={(event) => update(index, { question: event.target.value })}
                  />
                )}
              </Field>
              <Field label={`Respuesta ${String(index + 1)}`}>
                {(field) => (
                  <textarea
                    {...field}
                    className={inputClass}
                    rows={3}
                    maxLength={MAX_ANSWER}
                    disabled={!editable}
                    value={faq.answer}
                    onChange={(event) => update(index, { answer: event.target.value })}
                  />
                )}
              </Field>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={index === 0}
                    aria-label={`Subir la pregunta ${String(index + 1)}`}
                    onClick={() => move(index, -1)}
                  >
                    Subir
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={index === faqs.length - 1}
                    aria-label={`Bajar la pregunta ${String(index + 1)}`}
                    onClick={() => move(index, 1)}
                  >
                    Bajar
                  </Button>
                  <Button
                    variant="danger"
                    aria-label={`Quitar la pregunta ${String(index + 1)}`}
                    onClick={() => setFaqs((current) => current.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {editable && faqs.length < MAX_FAQS && (
          <div>
            <Button
              variant="secondary"
              onClick={() => setFaqs((current) => [...current, { question: '', answer: '' }])}
            >
              Agregar pregunta
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="policy" className="flex flex-col gap-2">
        <h2 id="policy" className="text-lg font-semibold">
          Política de pagos
        </h2>
        <Field
          label="Texto de la política"
          hint="En blanco, la app muestra que se publicará pronto. Los párrafos se separan con una línea vacía."
        >
          {(field) => (
            <textarea
              {...field}
              className={inputClass}
              rows={10}
              maxLength={MAX_POLICY}
              disabled={!editable}
              value={policy}
              onChange={(event) => {
                setSaved(false);
                setPolicy(event.target.value);
              }}
            />
          )}
        </Field>
      </section>

      {content.updatedAt && (
        <p className="text-xs text-ink-soft">
          Última actualización: {formatDateTime(content.updatedAt)}
          {content.updatedBy ? ` por ${content.updatedBy}` : ''}
        </p>
      )}
      {save.isError && <ErrorAlert error={save.error} />}
      {saved && (
        <p role="status" className="text-sm text-success">
          Se publicó la ayuda.
        </p>
      )}
      {editable && (
        <div>
          <Button type="submit" loading={save.isPending}>
            Guardar y publicar
          </Button>
        </div>
      )}
    </form>
  );
}
