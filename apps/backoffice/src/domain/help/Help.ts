/**
 * Ayuda de la app y política de pagos (COPAYNI-83). Lo que se guarda se publica al instante en la
 * app, sin publicar una versión nueva.
 */
export const HELP_LANGUAGES = ['es', 'en'] as const;
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];

export const HELP_LANGUAGE_LABELS: Record<HelpLanguage, string> = {
  es: 'Español',
  en: 'Inglés',
};

export interface Faq {
  question: string;
  answer: string;
}

export interface HelpContent {
  language: HelpLanguage;
  faqs: (Faq & { id: string })[];
  /** `null`: sin publicar (espera la aprobación de Legal, L4). */
  paymentPolicy: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface HelpInput {
  faqs: Faq[];
  paymentPolicy: string | null;
}

/** Límites del backend. */
export const MAX_FAQS = 50;
export const MAX_QUESTION = 200;
export const MAX_ANSWER = 2000;
export const MAX_POLICY = 20_000;
