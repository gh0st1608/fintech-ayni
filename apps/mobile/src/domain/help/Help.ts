/**
 * Ayuda y política de pagos (COPAYNI-83, Figma 2052:2484). El contenido llega del backend, que lo
 * edita el equipo de Ayni sin publicar la app.
 */
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface HelpContent {
  /** Idioma del contenido (puede ser `es` si el pedido no tiene). */
  language: string;
  faqs: Faq[];
  /** `null` mientras Legal no apruebe el texto. */
  paymentPolicy: { body: string; updatedAt: Date } | null;
  /** Enlace `https://wa.me/…` de soporte, o `null` si no hay canal. */
  whatsappUrl: string | null;
}

/** Sin tildes ni mayúsculas, para buscar "politica" y encontrar "Política". */
const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Las preguntas cuya pregunta o respuesta contienen el texto buscado. */
export function filterFaqs(faqs: readonly Faq[], query: string): Faq[] {
  const needle = normalize(query);
  if (!needle) return [...faqs];
  return faqs.filter(
    ({ question, answer }) =>
      normalize(question).includes(needle) || normalize(answer).includes(needle),
  );
}
