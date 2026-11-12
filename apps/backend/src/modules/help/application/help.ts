import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { ValidationError } from '../../../shared/errors/app-error';

/**
 * Ayuda y política de pagos (COPAYNI-83, D7, Figma 2052:2484). El contenido vive en la base y lo
 * edita el personal desde el back-office: cambiarlo no exige publicar la app.
 */
export const HELP_LANGUAGES = ['es', 'en'] as const;
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];
export const DEFAULT_HELP_LANGUAGE: HelpLanguage = 'es';

export const MAX_FAQS = 50;
export const MAX_QUESTION = 200;
export const MAX_ANSWER = 2000;
export const MAX_POLICY = 20_000;

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface HelpContent {
  language: HelpLanguage;
  faqs: Faq[];
  /** `null` mientras Legal no apruebe el texto (L4). */
  paymentPolicy: { body: string; updatedAt: Date } | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface HelpContentInput {
  faqs: { question: string; answer: string }[];
  paymentPolicy: string | null;
}

export const HELP_CONTENT = Symbol('HELP_CONTENT');
export const HELP_SETTINGS = Symbol('HELP_SETTINGS');

export interface HelpSettings {
  /** Número de WhatsApp de soporte en formato internacional sin "+", o `null` si no hay. */
  readonly supportWhatsapp: string | null;
}

export interface HelpContentPort {
  /** El contenido del idioma; `null` si no tiene ninguno. */
  find(language: HelpLanguage): Promise<HelpContent | null>;
  /** Reemplaza todo el contenido del idioma en una transacción. */
  replace(
    language: HelpLanguage,
    input: HelpContentInput,
    by: string,
    at: Date,
  ): Promise<HelpContent>;
}

export const isHelpLanguage = (value: string): value is HelpLanguage =>
  (HELP_LANGUAGES as readonly string[]).includes(value);

/**
 * `GET /v1/help?lang=`: la ayuda en el idioma pedido o, si no tiene contenido, en el idioma por
 * defecto (`es`). Incluye el contacto de soporte.
 */
@Injectable()
export class GetHelpUseCase {
  constructor(
    @Inject(HELP_CONTENT) private readonly content: HelpContentPort,
    @Inject(HELP_SETTINGS) private readonly settings: HelpSettings,
  ) {}

  async execute(
    language: string | undefined,
  ): Promise<{ content: HelpContent; supportWhatsapp: string | null }> {
    const requested = language && isHelpLanguage(language) ? language : DEFAULT_HELP_LANGUAGE;
    const withContent = (content: HelpContent | null): HelpContent | null =>
      content && (content.faqs.length > 0 || content.paymentPolicy) ? content : null;
    const found =
      withContent(await this.content.find(requested)) ??
      (requested === DEFAULT_HELP_LANGUAGE
        ? null
        : withContent(await this.content.find(DEFAULT_HELP_LANGUAGE)));
    return {
      content: found ?? {
        language: DEFAULT_HELP_LANGUAGE,
        faqs: [],
        paymentPolicy: null,
        updatedAt: null,
        updatedBy: null,
      },
      supportWhatsapp: this.settings.supportWhatsapp,
    };
  }
}

/** `GET /admin/v1/help/:lang`: el contenido tal como está, sin caer al idioma por defecto. */
@Injectable()
export class GetAdminHelpUseCase {
  constructor(@Inject(HELP_CONTENT) private readonly content: HelpContentPort) {}

  async execute(language: string): Promise<HelpContent> {
    if (!isHelpLanguage(language)) {
      throw new ValidationError('Idioma no admitido', { language: 'invalid' });
    }
    return (
      (await this.content.find(language)) ?? {
        language,
        faqs: [],
        paymentPolicy: null,
        updatedAt: null,
        updatedBy: null,
      }
    );
  }
}

/** `PUT /admin/v1/help/:lang`: reemplaza las preguntas y la política de un idioma. */
@Injectable()
export class UpdateHelpUseCase {
  private readonly logger = new Logger('Help');

  constructor(
    @Inject(HELP_CONTENT) private readonly content: HelpContentPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(language: string, input: HelpContentInput, staffId: string): Promise<HelpContent> {
    if (!isHelpLanguage(language)) {
      throw new ValidationError('Idioma no admitido', { language: 'invalid' });
    }
    if (input.faqs.length > MAX_FAQS) {
      throw new ValidationError(`Admite hasta ${MAX_FAQS} preguntas`, { faqs: 'too_many' });
    }
    const faqs = input.faqs.map(({ question, answer }) => ({
      question: question.trim(),
      answer: answer.trim(),
    }));
    if (faqs.some((faq) => !faq.question || !faq.answer)) {
      throw new ValidationError('Cada pregunta necesita su respuesta', { faqs: 'incomplete' });
    }
    const policy = input.paymentPolicy?.trim() || null;
    const saved = await this.content.replace(
      language,
      { faqs, paymentPolicy: policy },
      staffId,
      this.clock.now(),
    );
    this.logger.log({ event: 'help.updated', language, faqs: faqs.length, staffId });
    return saved;
  }
}
