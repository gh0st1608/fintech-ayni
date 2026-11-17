import { ValidationError } from '../../../shared/errors/app-error';

/**
 * Contenido de Home (COPAYNI-25, BO4 y BO5; docs/home-content-plan.md). Las ofertas son el
 * carrusel de láminas y las metas populares las tarjetas de abajo. Viven en la base y las edita el
 * personal desde el back-office, como la ayuda (COPAYNI-83): cambiar una campaña no exige publicar
 * la app.
 */
export const CONTENT_LANGUAGES = ['es', 'en'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'es';

export const isContentLanguage = (value: string): value is ContentLanguage =>
  (CONTENT_LANGUAGES as readonly string[]).includes(value);

/**
 * A dónde lleva el toque. Es una **lista cerrada de pantallas de la app**, no una URL: con una URL
 * libre, quien edita el contenido podría publicar un enlace externo dentro de la app (BO4).
 */
export const CONTENT_TARGETS = [
  /** Planes de ahorro con cashback (COPAYNI-32 y 33). */
  'savings_plans',
  /** Flujo de unión a una junta; con `targetAmount` precarga ese monto. */
  'join_circle',
  /** Invita a un amigo (COPAYNI-51). */
  'referral',
  /** Ayuda y política de pagos (COPAYNI-83). */
  'help',
  /** Solo informativo: la tarjeta no es pulsable. */
  'none',
] as const;
export type ContentTarget = (typeof CONTENT_TARGETS)[number];

/**
 * Ilustración: una clave del catálogo que viaja en la app, no un archivo subido (BO4). Evita un
 * bucket público, un CDN y moderar lo que alguien suba, y funciona sin red. Agregar una exige
 * publicar la app, que es el precio acordado.
 */
export const ILLUSTRATIONS = [
  'megaphone',
  'gift',
  'piggy-bank',
  'calendar',
  'school',
  'home',
  'travel',
  'celebration',
] as const;
export type Illustration = (typeof ILLUSTRATIONS)[number];

/** Fondos del design system; no se admite un color libre, para no romper el contraste. */
export const OFFER_BACKGROUNDS = ['cream', 'blush', 'mint', 'lilac'] as const;
export type OfferBackground = (typeof OFFER_BACKGROUNDS)[number];
export const GOAL_BACKGROUNDS = ['primary', 'orange', 'green'] as const;
export type GoalBackground = (typeof GOAL_BACKGROUNDS)[number];

export const MAX_OFFER_TITLE = 60;
export const MAX_OFFER_SUBTITLE = 40;
export const MAX_GOAL_TITLE = 24;
export const MAX_GOAL_SUBTITLE = 32;
/** Tope de tarjetas por sección: Home no es un catálogo. */
export const MAX_ITEMS = 10;

/** Texto de una tarjeta en un idioma. */
export interface ContentText {
  title: string;
  subtitle: string | null;
}

export type ContentTexts = Record<ContentLanguage, ContentText>;

interface ContentItemBase {
  id: string;
  texts: ContentTexts;
  illustration: Illustration;
  target: ContentTarget;
  /** Monto en unidades menores para `join_circle`; `null` en los demás destinos. */
  targetAmount: number | null;
  position: number;
  active: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface HomeOffer extends ContentItemBase {
  background: OfferBackground;
  /** Ventana de vigencia; fuera de ella no se muestra, así una campaña caduca sola. */
  startsOn: Date | null;
  endsOn: Date | null;
}

export interface HomeGoal extends ContentItemBase {
  background: GoalBackground;
}

/** Lo que ve la app: ya resuelto a un idioma y sin los campos de gestión. */
export interface ResolvedItem {
  id: string;
  title: string;
  subtitle: string | null;
  illustration: Illustration;
  /** Token del design system; la app resuelve el color, no llega un hex del servidor. */
  background: OfferBackground | GoalBackground;
  target: ContentTarget;
  targetAmount: number | null;
}

export interface HomeContent {
  offers: ResolvedItem[];
  goals: ResolvedItem[];
}

/**
 * Resuelve el texto al idioma pedido. Si ese idioma no tiene título (el personal todavía no lo
 * tradujo), cae al español: es mejor mostrarlo en otro idioma que dejar un hueco.
 */
export function resolveText(texts: ContentTexts, language: ContentLanguage): ContentText {
  const wanted = texts[language];
  if (wanted?.title) return wanted;
  return texts[DEFAULT_CONTENT_LANGUAGE];
}

export const toResolved = (item: HomeOffer | HomeGoal, language: ContentLanguage): ResolvedItem => {
  const text = resolveText(item.texts, language);
  return {
    id: item.id,
    title: text.title,
    subtitle: text.subtitle,
    illustration: item.illustration,
    background: item.background,
    target: item.target,
    targetAmount: item.targetAmount,
  };
};

/** Si la oferta corresponde mostrarla hoy: activa y dentro de su ventana. */
export function isVisible(
  offer: Pick<HomeOffer, 'active' | 'startsOn' | 'endsOn'>,
  now: Date,
): boolean {
  if (!offer.active) return false;
  if (offer.startsOn && offer.startsOn.getTime() > now.getTime()) return false;
  if (offer.endsOn && offer.endsOn.getTime() < now.getTime()) return false;
  return true;
}

/** Lo que el back-office envía al crear o editar. */
export interface ContentItemInput {
  texts: ContentTexts;
  illustration: Illustration;
  target: ContentTarget;
  targetAmount: number | null;
  position: number;
  active: boolean;
}

export interface OfferInput extends ContentItemInput {
  background: OfferBackground;
  startsOn: Date | null;
  endsOn: Date | null;
}

export interface GoalInput extends ContentItemInput {
  background: GoalBackground;
}

function assertTexts(texts: ContentTexts, maxTitle: number, maxSubtitle: number): void {
  for (const language of CONTENT_LANGUAGES) {
    const text = texts[language];
    // El español es obligatorio: es el idioma al que cae todo lo demás.
    if (language === DEFAULT_CONTENT_LANGUAGE && !text?.title?.trim()) {
      throw new ValidationError('El título en español es obligatorio', { texts: 'required' });
    }
    if (text?.title && text.title.length > maxTitle) {
      throw new ValidationError(`El título no puede pasar de ${maxTitle} caracteres`, {
        texts: 'too_long',
      });
    }
    if (text?.subtitle && text.subtitle.length > maxSubtitle) {
      throw new ValidationError(`El subtítulo no puede pasar de ${maxSubtitle} caracteres`, {
        texts: 'too_long',
      });
    }
  }
}

function assertTarget(input: ContentItemInput): void {
  // Un monto precargado solo tiene sentido al mandar al flujo de unión.
  if (input.targetAmount !== null && input.target !== 'join_circle') {
    throw new ValidationError('El monto solo aplica al destino join_circle', {
      targetAmount: 'invalid',
    });
  }
  if (
    input.targetAmount !== null &&
    (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0)
  ) {
    throw new ValidationError('El monto debe ser un entero positivo en unidades menores', {
      targetAmount: 'invalid',
    });
  }
}

export function assertOffer(input: OfferInput): void {
  assertTexts(input.texts, MAX_OFFER_TITLE, MAX_OFFER_SUBTITLE);
  assertTarget(input);
  if (input.startsOn && input.endsOn && input.startsOn.getTime() > input.endsOn.getTime()) {
    throw new ValidationError('La vigencia termina antes de empezar', { endsOn: 'invalid' });
  }
}

export function assertGoal(input: GoalInput): void {
  assertTexts(input.texts, MAX_GOAL_TITLE, MAX_GOAL_SUBTITLE);
  assertTarget(input);
}
